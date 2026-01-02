import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  server: {
    fs: {
      allow: [
        // apps/web (현재 프로젝트)
        path.resolve(__dirname),
        // 모노레포 상위 루트
        path.resolve(__dirname, "../.."),
        // core 패키지 (원하면 이것만 허용해도 됨)
        path.resolve(__dirname, "../../packages/core"),
      ],
    },
  },
});
