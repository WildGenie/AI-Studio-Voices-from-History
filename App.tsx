/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { InputForm } from './components/InputForm';
import { ScenarioDisplay } from './components/ScenarioDisplay';
import { researchLocationAndDate, generateDialogueAudio, generateCharacterAvatar } from './services/geminiService';
import { HistoricalScenario } from './types';
import { Loader2Icon, MoonIcon, SunIcon } from 'lucide-react';

const App: React.FC = () => {
  const [loadingStep, setLoadingStep] = useState<'idle' | 'researching' | 'generating_media'>('idle');
  const [scenario, setScenario] = useState<HistoricalScenario | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Initialize theme based on preference or default to dark
  useEffect(() => {
    // Check if user has a system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        setIsDarkMode(false);
    } else {
        setIsDarkMode(true);
    }
  }, []);

  // Update HTML class when theme changes
  useEffect(() => {
    if (isDarkMode) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
      setIsDarkMode(!isDarkMode);
  };

  const handleSubmit = async (location: string, date: string, generateImages: boolean) => {
    setLoadingStep('researching');
    setError(null);
    setScenario(null);
    setAudioBuffer(null);

    try {
      // Step 1: Research and Script
      const scenarioData = await researchLocationAndDate(location, date);
      
      // Step 2: Generate Audio & Images in Parallel
      setLoadingStep('generating_media');

      // 2a. Audio Generation
      const audioPromise = generateDialogueAudio(scenarioData);

      // 2b. Avatar Generation
      const imagesPromise = (async () => {
         // Pass through characters directly if no images requested
         if (!generateImages) {
             return scenarioData;
         }

         const updatedChars = await Promise.all(scenarioData.characters.map(async (char) => {
             if (char.visualDescription) {
                 const url = await generateCharacterAvatar(char.visualDescription, scenarioData.context);
                 return { ...char, avatarUrl: url || undefined };
             }
             return char;
         }));
         return { ...scenarioData, characters: updatedChars };
      })();

      // Wait for both
      const [buffer, scenarioWithImages] = await Promise.all([audioPromise, imagesPromise]);
      
      setAudioBuffer(buffer);
      setScenario(scenarioWithImages);
      
      setLoadingStep('idle');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
      setLoadingStep('idle');
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#0f172a] text-stone-900 dark:text-slate-200 selection:bg-amber-500/30 flex flex-col transition-colors duration-300 relative">
      
      {/* Mist Background Layers */}
      <div className="mist-container">
        <div className="mist-layer"></div>
        <div className="mist-layer"></div>
      </div>

      {/* Header */}
      <header className="py-8 px-4 text-center border-b border-stone-200 dark:border-slate-800 bg-stone-50/95 dark:bg-[#0f172a]/95 sticky top-0 z-50 backdrop-blur-sm transition-colors duration-300">
        <div className="container mx-auto relative flex justify-center items-center">
            <div className="text-center px-12 md:px-0">
                <h1 className="font-serif-display text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-700 via-yellow-500 to-amber-700 dark:from-amber-200 dark:via-amber-100 dark:to-amber-200 bg-[length:200%_auto] animate-shine tracking-tight mb-2 transition-colors duration-300">
                Voices from History
                </h1>
                <p className="text-stone-500 dark:text-slate-400 text-sm md:text-base max-w-lg mx-auto font-light transition-colors duration-300">
                Enter a place and time to hear imagined conversations from the past.
                </p>
            </div>
            
            <button 
                onClick={toggleTheme}
                className="absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-stone-200 dark:hover:bg-slate-800 text-stone-500 dark:text-slate-400 transition-colors"
                title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
                {isDarkMode ? <SunIcon size={20} /> : <MoonIcon size={20} />}
            </button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 flex flex-col items-center gap-12 flex-grow relative z-10">
        
        {/* Input Section - Only show if no scenario or if loading */}
        {(!scenario || loadingStep !== 'idle') && (
            <div className={`w-full transition-all duration-500 ${scenario ? 'opacity-50 pointer-events-none scale-95 hidden' : 'opacity-100 scale-100'}`}>
                <InputForm onSubmit={handleSubmit} isLoading={loadingStep !== 'idle'} />
            </div>
        )}

        {/* Loading Indicator */}
        {loadingStep !== 'idle' && (
          <div className="flex flex-col items-center justify-center space-y-4 py-12 animate-pulse">
            <Loader2Icon size={48} className="text-amber-600 dark:text-amber-400 animate-spin" />
            <p className="text-xl font-light text-stone-600 dark:text-amber-200">
              {loadingStep === 'researching' ? 'Analyzing historical sources...' : 'Generating voices and characters...'}
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/50 text-red-800 dark:text-red-200 px-6 py-4 rounded-xl max-w-md text-center">
            <p>{error}</p>
            <button 
                onClick={() => setError(null)}
                className="mt-4 text-sm font-semibold hover:text-red-600 dark:hover:text-white underline decoration-red-500/50 hover:decoration-current"
            >
                Try Again
            </button>
          </div>
        )}

        {/* Results */}
        {scenario && loadingStep === 'idle' && (
          <>
             <button 
                onClick={() => { setScenario(null); setAudioBuffer(null); }}
                className="fixed bottom-6 right-6 z-50 bg-white dark:bg-slate-800 hover:bg-stone-100 dark:hover:bg-slate-700 text-stone-600 dark:text-slate-300 px-4 py-2 rounded-full shadow-lg border border-stone-200 dark:border-slate-700 text-sm font-medium transition-colors"
             >
                New Search
             </button>
             <ScenarioDisplay scenario={scenario} audioBuffer={audioBuffer} />
          </>
        )}
      </main>

      {/* Disclaimer Footer */}
      <footer className="w-full py-6 text-center text-stone-400 dark:text-slate-500 text-xs border-t border-stone-200 dark:border-slate-800/50 mt-auto transition-colors duration-300 relative z-10">
        <p>All voices, scripts, and characters are generated by AI and may contain historical inaccuracies.</p>
      </footer>
    </div>
  );
};

export default App;