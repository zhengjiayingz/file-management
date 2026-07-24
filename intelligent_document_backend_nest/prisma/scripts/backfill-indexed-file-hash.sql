-- 为 ready 且 indexed_file_hash 为空的记录，从 file_storage 回填当前文件 hash
UPDATE document_index_jobs dij
JOIN user_files uf ON uf.id = dij.user_file_id
JOIN file_storage fs ON fs.id = uf.storage_id
SET dij.indexed_file_hash = fs.file_hash
WHERE dij.indexed_file_hash IS NULL
  AND dij.status = 'ready'
  AND uf.storage_id IS NOT NULL;
