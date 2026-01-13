/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { SparklesIcon, SearchIcon } from 'lucide-react';

interface InputFormProps {
  onSubmit: (location: string, date: string, generateImages: boolean) => void;
  isLoading: boolean;
}

// Presets restricted to pre-1825
const PRESETS = [
  { label: "Tenochtitlan Market", location: 'Tlatelolco, Mexico-Tenochtitlan', date: '1519-04-20' },
  { label: "Heian Kyoto", location: 'Kyoto Imperial Palace, Japan', date: '1000-05-05' },
  { label: "Mansa Musa's Timbuktu", location: 'Djinguereber Mosque, Timbuktu', date: '1324-10-15' },
  { label: "Taj Mahal Gardens", location: 'Agra, India', date: '1650-02-14' },
  { label: "Baghdad House of Wisdom", location: 'Baghdad, Iraq', date: '0850-03-21' },
  { label: "Great Zimbabwe", location: 'Great Zimbabwe Ruins', date: '1400-07-01' },
  { label: "Machu Picchu", location: 'Machu Picchu, Peru', date: '1460-06-21' },
  { label: "Tang Dynasty Chang'an", location: 'Chang\'an, China', date: '0715-01-28' },
  { label: "Benin City", location: 'Benin City, Edo Kingdom', date: '1500-03-10' },
  { label: "Samarkand Silk Road", location: 'Registan Square, Samarkand', date: '1420-09-15' }
];

export const InputForm: React.FC<InputFormProps> = ({ onSubmit, isLoading }) => {
  // Initialize with a random preset so every page load is different
  const [initialPreset] = useState(() => PRESETS[Math.floor(Math.random() * PRESETS.length)]);
  
  const [location, setLocation] = useState<string>(initialPreset.location);
  const [date, setDate] = useState<string>(initialPreset.date);
  const [generateImages, setGenerateImages] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(location, date, generateImages);
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-8">
      <form onSubmit={handleSubmit} className="space-y-6 bg-white/80 dark:bg-slate-800/50 p-8 rounded-2xl border border-stone-200 dark:border-slate-700 shadow-xl backdrop-blur-sm transition-colors duration-300">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-slate-400 mb-1 transition-colors">Location</label>
            <div className="relative">
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Address, Landmark, or Coordinates"
                className="w-full bg-white dark:bg-slate-900 border border-stone-300 dark:border-slate-700 rounded-lg py-3 pl-10 px-4 text-stone-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
              />
              <SearchIcon className="absolute left-3 top-3.5 text-stone-400 dark:text-slate-500" size={18} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-slate-400 mb-1 transition-colors">Time Travel Date (Max 1825)</label>
            <div className="relative">
              <input
                type="date"
                required
                max="1825-12-31"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-stone-300 dark:border-slate-700 rounded-lg py-3 px-4 text-stone-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all [color-scheme:light] dark:[color-scheme:dark] cursor-pointer"
              />
            </div>
          </div>

          <div>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50/50 dark:bg-slate-900/30 cursor-pointer hover:bg-stone-100 dark:hover:bg-slate-900/50 transition-colors">
              <input 
                type="checkbox"
                checked={generateImages}
                onChange={e => setGenerateImages(e.target.checked)}
                className="mt-1 w-4 h-4 text-amber-500 rounded border-stone-300 dark:border-slate-600 focus:ring-amber-500 bg-white dark:bg-slate-800"
              />
              <div className="space-y-1">
                <span className="block text-sm font-medium text-stone-700 dark:text-slate-300 transition-colors">Generate Character Portraits</span>
                <span className="block text-xs text-stone-500 dark:text-slate-500 leading-relaxed transition-colors">
                   Generates avatars using the Nano Banana model. Uncheck this if you are running into quota limits or want faster results.
                </span>
              </div>
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-all duration-300 ${
            isLoading 
              ? 'bg-stone-300 dark:bg-slate-700 text-stone-500 dark:text-slate-400 cursor-not-allowed' 
              : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/25 hover:shadow-amber-500/40'
          }`}
        >
          {isLoading ? (
            <span className="animate-pulse">Analyzing historical sources...</span>
          ) : (
            <>
              <SparklesIcon size={20} /> Listen to the past
            </>
          )}
        </button>
      </form>
    </div>
  );
};