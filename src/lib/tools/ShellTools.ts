import * as os from 'os';
import {spawn} from 'child_process';
import {sample as processStatsSample, lag as processStatsLag} from 'process-stats-sampler';
import {Logger} from '../Logger';

const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB

export interface ProcessStatistics {
    pid: number;
    ppid: number;
    cpu: string;
    ctime: string;
    elapsed: string;
    timestamp: number;
}

export interface ExecOptions {
    timeout?: number;
    maxBuffer?: number;
    encoding?: BufferEncoding;
    killSignal?: NodeJS.Signals;
}

export class ShellTools {

    public static async exec(cmd: string, args: string[], options: ExecOptions = {}): Promise<{
        stdout: string;
        code: number
    }> {

        const {timeout = 0, encoding = 'utf8'} = options;

        /**
         * 执行Shell命令
         *
         * @param {string} cmd - 要执行的命令
         * @param {string[]} args - 命令参数数组
         * @param {ExecOptions} [options] - 执行选项
         * @returns {Promise<{stdout: string; code: number}>} 返回命令输出和退出码
         * @throws {Error} 命令执行失败时抛出错误
         */
        return new Promise((resolve, reject) => {

            let isCompleted = false; // 使用对象引用来标记是否已经执行回调函数;
            let stdout = '';
            let stderr = '';

            // 创建子进程
            const ch = spawn(cmd, args);
            ch.stdout.setEncoding(encoding);
            ch.stderr.setEncoding(encoding);

            // 设置超时
            const timer = timeout > 0 ? setTimeout(() => {
                ch.kill();
                reject(new Error(`Command timed out after ${timeout}ms`));
            }, timeout) : null;

            // 监听子进程的 stdout 事件，将输出追加到 stdout 变量中
            ch.stdout.on('data', (d) => {
                if (stdout.length < MAX_BUFFER_SIZE) {
                    stdout += d;
                }
            });

            // 监听子进程的 stderr 事件，将错误输出追加到 stderr 变量中
            ch.stderr.on('data', (d) => {
                if (stderr.length < MAX_BUFFER_SIZE) {
                    stderr += d;
                }
            });

            // 监听子进程的 error 事件，处理进程启动错误
            ch.on('error', (err: Error) => {
                if (isCompleted) return;
                cleanup();
                reject(err);
            });

            // 监听子进程的 close 事件，处理进程结束
            ch.on('close', function (code, signal) {
                if (isCompleted) return;
                cleanup();

                // 进程被信号终止，返回相应的错误信息
                if (signal) {
                    reject(new Error(`Command "${cmd} ${args.join(' ')}" was terminated by signal ${signal}`));
                    return;
                }

                // 进程有错误输出，返回包含命令和错误信息的错误对象
                if (stderr) {
                    reject(new Error(`Command "${cmd} ${args.join(' ')}" exited with error: ${stderr}`));
                    return;
                }

                // 进程正常结束，返回命令输出和退出码
                resolve({stdout, code});
            });

            function cleanup() {
                isCompleted = true;
                ch.removeAllListeners();
                if (timer) clearTimeout(timer);
            }
        });
    }

    /**
     * 获取进程统计信息
     *
     * @param {number[]} pids - 进程ID数组
     * @returns {Promise<Record<number, ProcessStatistics>>} 返回进程统计信息映射表
     * @throws {Error} 输入无效或获取统计信息失败时抛出错误
     */
    public static async ps(pids: number[]): Promise<Record<number, ProcessStatistics>> {
        if (!Array.isArray(pids) || pids.length === 0) {
            throw new Error('Invalid PIDs input');
        }

        const command = os.platform() === 'darwin' ? 'ps' : 'ps -o';
        const args = [
            '-o',
            'etime,pid,ppid,pcpu,time',
            '-p',
            pids.filter(pid => Number.isInteger(pid)).join(',')
        ];

        try {
            const result = await this.exec(command, args);
            if (result.code !== 0) {
                Logger.warn(`ps command failed with code ${result.code}`);
                return {};
            }

            const now = Date.now();
            const statistics: Record<number, ProcessStatistics> = {};
            const output = result.stdout
                .split(os.EOL)
                .slice(1)
                .filter(line => line.trim());

            for (const line of output) {
                const [etime, pid, ppid, cpu, ctime] = line.trim().split(/\s+/);

                if (!pid) continue;

                statistics[Number(pid)] = {
                    pid: Number(pid),
                    ppid: Number(ppid),
                    cpu,
                    ctime,
                    elapsed: etime,
                    timestamp: now
                };
            }

            return statistics;
        } catch (error) {
            throw new Error(`Failed to get process statistics: ${error.message}`);
        }
    }

    /**
     * 创建一个延迟测量函数，用于检测实际延迟与预期延迟的差异
     *
     * @param {number} ms - 预期的延迟时间，默认为1000毫秒
     * @returns {Promise<number>} 返回一个函数，调用该函数可获取当前延迟值
     */
    public static async lag(ms: number = 1000): Promise<number> {
        return processStatsLag(ms);
    }


    /**
     * Node.js 运行内存和CPU监控
     *
     * @param {string} filename
     * @param {number} interval - lag probe wait in second
     * @return {Promise<void>}
     */
    public static async monitor(filename: string = '/tmp/stats.log', interval: number = 30): Promise<void> {
        try {
            await processStatsSample(filename, {lag: interval * 1000});
        } catch (e) {
            Logger.warn(e instanceof Error ? e.message : String(e));
        }
    }
}
