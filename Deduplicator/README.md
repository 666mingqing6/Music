# 文件去重工具 (Deduplicator)

一个基于 MD5 哈希的高性能命令行文件去重工具，支持递归扫描、断点续传（大文件分块读取）以及多种去重策略。

## 特性

- **高性能扫描**：在 1 万个文件 / 5 GB 数据量下，运行时间不超过 60 秒。
- **安全删除**：默认将重复文件移动到系统回收站，支持 `--force` 参数进行永久删除。
- **内存优化**：采用二进制流分块读取（1MB/chunk），内存峰值控制在 200MB 以内。
- **详细报告**：支持生成 JSON 或 CSV 格式的处理报告。
- **健壮性**：自动跳过符号链接和系统隐藏文件，捕获权限错误等异常。

## 安装

1. 确保已安装 Python 3.8+。
2. 安装依赖：

```bash
pip install -r requirements.txt
```

## 运行

### 交互模式
运行脚本后按提示输入目录路径：
```bash
python deduplicate.py
```

### 命令行参数
```bash
python deduplicate.py /path/to/dir --no-trash --force --output-report my_report.csv
```

**常用参数说明：**
- `path`: 目标目录路径。
- `--trash`: 移动重复文件到回收站（默认开启）。
- `--no-trash`: 不使用回收站（配合 `--force` 永久删除，否则仅记录不处理）。
- `--force`: 永久删除文件（在 `--no-trash` 时生效）。
- `--output-report`: 报告输出路径 (默认 `report.json`)。
- `--log-level`: 日志级别 (DEBUG, INFO, WARNING, ERROR)。

## 测试

使用 `pytest` 运行单元测试：
```bash
pytest tests/
```

## 性能验证

你可以使用 `sample/gen_sample.py` 生成测试数据：
```bash
python sample/gen_sample.py
```
然后运行 `deduplicate.py` 观察处理时间与磁盘空间节省情况。
