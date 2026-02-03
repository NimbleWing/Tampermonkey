// merge-novel.js - 小说章节合并工具
const fs = require('fs');
const path = require('path');

const inputDir = __dirname;
const outputFile = path.join(inputDir, 'merged_novel.txt');

function mergeNovel() {
  // 获取所有章节文件
  const files = fs.readdirSync(inputDir)
    .filter(f => f.endsWith('.txt') && f.includes('##'))
    .sort((a, b) => {
      const numA = parseInt(a.split('##')[0]) || 0;
      const numB = parseInt(b.split('##')[0]) || 0;
      return numA - numB;
    });

  if (files.length === 0) {
    console.log('未找到章节文件');
    return;
  }

  // 合并内容（含标题）
  const mergedContent = files.map(file => {
    const content = fs.readFileSync(path.join(inputDir, file), 'utf-8');
    const title = file.split('##')[1].replace('.txt', '');
    return `【${title}】\n${content.trim()}`;
  }).join('\n\n');

  // 写入输出文件
  fs.writeFileSync(outputFile, mergedContent, 'utf-8');
  console.log(`✅ 已合并 ${files.length} 个章节到: ${outputFile}`);

  // 删除原始文件函数（默认屏蔽）
  // deleteOriginalFiles(files);

  // function deleteOriginalFiles(files) {
  //   files.forEach(file => {
  //     fs.unlinkSync(path.join(inputDir, file));
  //   });
  //   console.log(`🗑️ 已删除 ${files.length} 个原始文件`);
  // }
}

mergeNovel();
