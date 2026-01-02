import type { Plan } from "../types";
import { type ShapeType } from "../types";
import { type CutoutMeta } from "../geometry/cutouts";

export type ProjectState = {
  plan: Plan;
  cutoutsMeta: CutoutMeta[];
  shapeType: ShapeType;
  timestamp?: number;
};

const STORAGE_KEY = "deck-estimator-project";

export const persistence = {
  saveToLocal: (state: ProjectState) => {
    try {
      const data = JSON.stringify({ ...state, timestamp: Date.now() });
      localStorage.setItem(STORAGE_KEY, data);
    } catch (e) {
      console.warn("Failed to save to local storage", e);
    }
  },

  loadFromLocal: (): ProjectState | null => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;
      return JSON.parse(data) as ProjectState;
    } catch (e) {
      console.warn("Failed to load from local storage", e);
      return null;
    }
  },

  exportToJson: (state: ProjectState, filename: string = "deck-project.json") => {
    try {
      const data = JSON.stringify({ ...state, timestamp: Date.now() }, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export project", e);
      alert("프로젝트 내보내기에 실패했습니다.");
    }
  },

  importFromJson: (file: File): Promise<ProjectState> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const data = JSON.parse(text) as ProjectState;
          if (!data.plan || !data.plan.polygon) {
            throw new Error("Invalid project file format");
          }
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  },
};
