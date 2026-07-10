-- AlterEnum: 转存到网盘时写入访问日志 action=save
ALTER TABLE `share_access_logs` MODIFY COLUMN `action` ENUM('view', 'download', 'save') NOT NULL;
