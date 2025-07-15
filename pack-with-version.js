const fs = require("fs-extra"); // 使用 fs-extra 替代原生 fs
const path = require("path");
const archiver = require("archiver"); // 引入 archiver 库

// 定义文件路径和输出设置
const manifestJsonPath = path.resolve(__dirname, "manifest.json");
const outputDir = path.resolve(__dirname, "dist"); // ZIP 文件输出目录
const tempFolderInDist = path.join(outputDir, "Local Dict"); // 临时文件夹，ZIP 内部的 'Local Dict'

async function packWithVersion() {
  try {
    // 1. 确保 dist 和 临时文件夹存在并清理旧的
    await fs.ensureDir(outputDir); // 确保 outputDir 存在
    if (await fs.pathExists(tempFolderInDist)) {
      await fs.remove(tempFolderInDist); // 删除旧的临时文件夹
    }
    await fs.ensureDir(tempFolderInDist); // 创建新的临时文件夹

    // 2. 读取 manifest.json 获取版本号
    const manifestJson = JSON.parse(
      await fs.readFile(manifestJsonPath, "utf8")
    );
    const version = manifestJson.version;

    // 3. 将指定文件复制到临时文件夹
    console.log("复制文件到临时打包目录...");
    await fs.copy(
      path.resolve(__dirname, "main.js"),
      path.join(tempFolderInDist, "main.js")
    );
    await fs.copy(
      path.resolve(__dirname, "package.json"),
      path.join(tempFolderInDist, "package.json")
    );
    await fs.copy(
      path.resolve(__dirname, "styles.css"),
      path.join(tempFolderInDist, "styles.css")
    );
    console.log("文件复制完成。");

    // 4. 构建带版本号的基准 ZIP 文件名
    const baseZipFileName = `Local Dict ${version}.zip`;
    let finalZipFileName = baseZipFileName;
    let fullZipPath = path.join(outputDir, finalZipFileName);

    // 5. 检查文件是否冲突，如果冲突则添加时间戳
    if (await fs.pathExists(fullZipPath)) {
      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, "-")
        .replace(/\..+/, ""); // YYYY-MM-DDTHH-MM-SS
      finalZipFileName = `Local Dict ${version}-${timestamp}.zip`;
      fullZipPath = path.join(outputDir, finalZipFileName);
      console.log(`\n检测到文件冲突。新文件名: ${finalZipFileName}`);
    } else {
      console.log(`\n未检测到文件冲突。文件名: ${finalZipFileName}`);
    }

    // 6. 使用 archiver 创建 ZIP 文件
    console.log(`开始打包: ${finalZipFileName}`);

    const output = fs.createWriteStream(fullZipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // 设置压缩级别
    });

    output.on("close", function () {
      console.log(
        `打包完成！文件位于: ${fullZipPath} (${archive.pointer()} total bytes)`
      );
    });

    archive.on("error", function (err) {
      throw err;
    });

    archive.pipe(output);

    // 将 temp_zip_content_folder 的内容添加到 ZIP 中，作为 'Local Dict'
    // archive.directory(source_path, dest_path_in_zip)
    archive.directory(tempFolderInDist, "Local Dict"); // 将临时文件夹的内容添加到 ZIP 内部的 'Local Dict'

    await archive.finalize(); // 完成打包
  } catch (error) {
    console.error("打包失败:", error);
    process.exit(1); // 退出并返回非零状态码表示失败
  } finally {
    // 7. 清理临时文件夹 (无论成功失败都尝试清理)
    if (await fs.pathExists(tempFolderInDist)) {
      await fs.remove(tempFolderInDist);
      console.log("临时文件夹已清理。");
    }
  }
}

packWithVersion(); // 调用异步函数
