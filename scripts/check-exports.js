#!/usr/bin/env node

/**
 * Core 패키지 Export 검증 스크립트
 *
 * packages/core/src/의 모든 .ts 파일이 index.ts에서 export되는지 확인합니다.
 * 이 스크립트는 모듈 누락 버그를 방지합니다.
 *
 * 사용법: npm run check:exports
 */

const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "../packages/core/src");
const indexPath = path.join(srcDir, "index.ts");

console.log("🔍 Core 패키지 export 검증 중...\n");

// src 폴더의 모든 .ts 파일 (index.ts, test 파일 제외)
const tsFiles = fs
  .readdirSync(srcDir)
  .filter(
    (f) => f.endsWith(".ts") && f !== "index.ts" && !f.endsWith(".test.ts") && !f.startsWith("_"),
  );

// index.ts 내용 읽기
const indexContent = fs.readFileSync(indexPath, "utf-8");

// 누락된 export 확인
const missing = [];
const exported = [];

for (const file of tsFiles) {
  const moduleName = file.replace(".ts", ".js");
  const exportPattern = `"./${moduleName}"`;

  if (indexContent.includes(exportPattern)) {
    exported.push(file);
  } else {
    missing.push(file);
  }
}

// 결과 출력
console.log("📦 확인된 모듈:");
for (const file of exported) {
  console.log(`   ✅ ${file}`);
}

if (missing.length > 0) {
  console.log("\n❌ index.ts에 누락된 export:");
  for (const file of missing) {
    console.log(`   ⚠️  ${file}`);
  }
  console.log("\n💡 해결방법: packages/core/src/index.ts에 다음을 추가하세요:");
  for (const file of missing) {
    const moduleName = file.replace(".ts", ".js");
    console.log(`   export * from "./${moduleName}";`);
  }
  console.log("");
  process.exit(1);
}

console.log("\n✅ 모든 모듈이 정상적으로 export되어 있습니다!\n");
process.exit(0);
