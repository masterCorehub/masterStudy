import { useState } from "react";
import { Icon } from "../ui/Icon";
import { SCREEN_IDS } from "../app/screenIds";
import { useStudyStore } from "../store/useStore";
import { motion } from "framer-motion";

export function CreateModuleScreen({ onNavigate }) {
  const activeCourseId = useStudyStore(state => state.activeCourseId);
  const addModule = useStudyStore(state => state.addModule);
  
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [duration, setDuration] = useState("");
  const [difficulty, setDifficulty] = useState("Beginner");

  const handleSave = () => {
    if (!title.trim()) return;
    
    if (!activeCourseId) {
      alert("Selecione um curso na Dashboard primeiro!");
      return;
    }

    addModule(activeCourseId, {
      title,
      subtitle,
      duration: "Auto",
      difficulty,
      moduleNumber: 1
    });
    if (onNavigate) onNavigate(SCREEN_IDS.MODULES);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex-1 overflow-y-auto p-6 md:p-10 pb-32 md:pb-12 bg-[color:var(--background)]"
    >
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold text-[color:var(--on-surface)] mb-2">Create New Module</h2>
            <p className="text-[color:var(--on-surface-variant)]">Design the curriculum and content for your next learning experience.</p>
          </div>
          <div className="flex gap-4">
            <button 
              className="px-6 py-2.5 rounded-xl text-[color:var(--on-surface-variant)] font-medium neo-raised active:neo-inset transition-all"
              onClick={() => onNavigate && onNavigate(SCREEN_IDS.DASHBOARD)}
            >
              Cancel
            </button>
            <button 
              className="px-6 py-2.5 rounded-xl text-[color:var(--primary)] font-semibold neo-raised active:neo-inset transition-all flex items-center gap-2"
              onClick={handleSave}
            >
              <Icon name="save" />
              Save Module
            </button>
          </div>
        </div>

        {/* Bento Grid Layout for Form */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Module Details (Wider) */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-[color:var(--background)] rounded-2xl p-6 md:p-8 neo-raised">
              <h3 className="text-lg font-semibold text-[color:var(--on-surface)] mb-6 flex items-center gap-2">
                <Icon className="text-[color:var(--tertiary)]" name="info" />
                Module Details
              </h3>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--on-surface-variant)] mb-2 ml-1">Module Title</label>
                  <input 
                    className="w-full bg-[color:var(--background)] border-none rounded-xl py-3 px-4 text-[color:var(--on-surface)] placeholder:text-[color:var(--outline-variant)] neo-inset focus:ring-0" 
                    placeholder="e.g., Introduction to Advanced Calculus" 
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[color:var(--on-surface-variant)] mb-2 ml-1">Description</label>
                  <textarea 
                    className="w-full bg-[color:var(--background)] border-none rounded-xl py-3 px-4 text-[color:var(--on-surface)] placeholder:text-[color:var(--outline-variant)] neo-inset focus:ring-0 resize-none" 
                    placeholder="Briefly describe what students will learn..." 
                    rows="4"
                    value={subtitle}
                    onChange={e => setSubtitle(e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--on-surface-variant)] mb-2 ml-1">Duration</label>
                    <div className="w-full bg-[color:var(--background)] border-none rounded-xl py-3 px-4 text-[color:var(--on-surface-variant)] neo-inset flex items-center cursor-not-allowed">
                      <Icon className="text-lg mr-2" name="schedule" /> Automático
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--on-surface-variant)] mb-2 ml-1">Difficulty Level</label>
                    <select 
                      className="w-full bg-[color:var(--background)] border-none rounded-xl py-3 px-4 text-[color:var(--on-surface)] neo-inset focus:ring-0 appearance-none cursor-pointer"
                      value={difficulty}
                      onChange={e => setDifficulty(e.target.value)}
                    >
                      <option>Beginner</option>
                      <option>Intermediate</option>
                      <option>Advanced</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Visuals & Settings */}
          <div className="space-y-8">
            <div className="bg-[color:var(--background)] rounded-2xl p-6 neo-raised flex flex-col h-full min-h-[300px]">
              <h3 className="text-lg font-semibold text-[color:var(--on-surface)] mb-4 flex items-center gap-2">
                <Icon className="text-[color:var(--tertiary)]" name="image" />
                Cover Image
              </h3>
              <div className="flex-1 w-full bg-[color:var(--background)] rounded-xl neo-inset flex flex-col items-center justify-center p-8 text-center cursor-pointer hover:text-[color:var(--primary)] transition-colors group aspect-video">
                <Icon className="text-4xl text-[color:var(--outline-variant)] mb-2 group-hover:text-[color:var(--primary)] transition-colors" name="cloud_upload" />
                <p className="text-sm font-medium text-[color:var(--on-surface-variant)] group-hover:text-[color:var(--primary)]">Click to upload cover</p>
                <p className="text-xs text-[color:var(--outline)] mt-1">PNG, JPG up to 5MB</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
