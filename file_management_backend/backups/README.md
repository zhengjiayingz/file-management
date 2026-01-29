# 数据库备份目录

这个目录用于存储数据库备份文件。

## 备份文件

备份文件会自动保存在这里，文件名格式：
- `backup_YYYY-MM-DDTHH-MM-SS-SSSZ.json`

## 使用方法

### 创建备份
```bash
cd file_management_backend
npx tsx scripts/backup-db.ts
```

### 恢复备份
```bash
npx tsx scripts/restore-db.ts backup_filename.json
```

## 注意事项

⚠️ **重要**：
- 备份文件包含敏感数据（用户密码哈希等）
- 不要将备份文件提交到版本控制
- 定期清理旧的备份文件
- 生产环境备份应存储在安全位置

## 自动清理

建议定期清理超过 30 天的备份文件：
```bash
# Windows PowerShell
Get-ChildItem -Path backups -Filter "backup_*.json" | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-30)} | Remove-Item

# Linux/Mac
find backups -name "backup_*.json" -mtime +30 -delete
```
