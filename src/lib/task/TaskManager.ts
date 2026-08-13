import {Logger} from '../Logger';
import {Utils} from '../Utils';

export type TaskFunction = (...args: any[]) => Promise<void>;

export interface Task {
    readonly id?: number;
    readonly name: string;
    readonly method: TaskFunction;
    readonly interval: number;
    readonly params: any[];
    readonly sync: boolean;
    retries: number;
}

export class TaskManager {
    private static _instance: TaskManager;
    private readonly _tasks = new Map<number, Task>();
    private _initialized: boolean;
    private _taskIdCounter = 0;

    private constructor() {
        this._initialized = false;
    }

    public static instance(): TaskManager {
        if (TaskManager._instance == undefined) {
            TaskManager._instance = new TaskManager();
        }
        return TaskManager._instance;
    }

    public init(tasks: Array<[m: TaskFunction, p: any[], i: number, s?: boolean]> = []) {
        // 避免重复初始化
        if (this._initialized) {
            return;
        }

        for (const [method, params, interval, sync] of tasks) {
            const task: Task = {
                id: ++this._taskIdCounter,
                name: method.name || 'anonymous',
                method,
                params,
                interval,
                sync: sync || false,
                retries: 0
            };
            this._tasks.set(task.id, task);
        }

        this._initialized = true;
        this.startTasks();
    }

    public startTasks() {
        if (!this._initialized) {
            throw new Error('TaskManager not initialized');
        }

        try {
            const execs = Array.from(this._tasks.values()).map(task => this.executeTask(task));
            Promise.all(execs).catch(Logger.warn);
        } catch (error) {
            Logger.warn(`[Task] Error:`, error);
        }
    }

    async executeTask(task: Task): Promise<void> {
        while (true) {
            if (task.retries > 5) {
                Logger.warn(`[Task:${task.name}] stopped permanently`);
                return; // 永久停止
            }

            // 立即执行任务
            if (!task.sync) {
                // 异步任务：触发即可，不用管结果
                task.method(...task.params)
                    .then(() => {
                        task.retries = 0;
                    })
                    .catch((e) => {
                        task.retries++;
                        Logger.warn(`[Task:${task.name}] failed`, e);
                    });
            } else {
                // 同步任务：等待并处理
                try {
                    await task.method(...task.params);
                    task.retries = 0;
                } catch (e) {
                    task.retries++;
                    Logger.warn(`[Task:${task.name}] failed`, e);
                }
            }

            await Utils.sleep(Math.max(task.interval, 1) * 1000);
        }
    }
}