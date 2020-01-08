--
-- Table structure for table formId_table
--

DROP TABLE IF EXISTS logs;
CREATE TABLE logs (
  id int(11) unsigned AUTO_INCREMENT NOT NULL COMMENT '日志id',
  uid int(11) unsigned NOT NULL COMMENT '用户id',
  type int(11) unsigned NOT NULL DEFAULT 0 COMMENT '类型',
  count int(11) NOT NULL DEFAULT 0 COMMENT '变更数量',
  remain int(11) unsigned NOT NULL DEFAULT 0 COMMENT '剩余数量',
  memo varchar(255) DEFAULT '' COMMENT '来源描述',
  time int(11) unsigned NOT NULL DEFAULT 0 COMMENT '时间戳',
  PRIMARY KEY (id),
  KEY uid USING BTREE (uid),
  KEY type USING BTREE (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Table structure for table demo_0
--

DROP TABLE IF EXISTS demo_0;
CREATE TABLE demo_0 (
  uid int(11) unsigned NOT NULL COMMENT '用户id',
  openId varchar(255) NOT NULL DEFAULT '' COMMENT '开放id',
  name varchar(255) NOT NULL DEFAULT '' COMMENT '昵称',
  createTime int(11) unsigned NOT NULL DEFAULT 0 COMMENT '创建时间',
  loginTime int(11) unsigned NOT NULL DEFAULT 0 COMMENT '登陆时间',
  status int(1) unsigned NOT NULL DEFAULT 0 COMMENT '状态',
  PRIMARY KEY (uid),
  KEY openId USING BTREE (openId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;