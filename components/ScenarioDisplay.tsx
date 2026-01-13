/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState } from 'react';
import { PlayIcon, PauseIcon, RotateCcwIcon, ExternalLinkIcon, InfoIcon, UserIcon, EyeIcon, EyeOffIcon, ChevronDownIcon } from 'lucide-react';
import { HistoricalScenario, DialogueLine, Annotation } from '../types';

interface ScenarioDisplayProps {
  scenario: HistoricalScenario;
  audioBuffer: AudioBuffer | null;
}

export const ScenarioDisplay: React.FC<ScenarioDisplayProps> = ({ scenario, audioBuffer }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stopAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [audioBuffer]); // Reset if audio buffer changes

  const initAudioContext = () => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
  };

  const playAudio = () => {
    if (!audioBuffer) return;
    initAudioContext();
    const ctx = audioContextRef.current!;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    // Determine start time based on pause location
    const offset = pauseTimeRef.current % audioBuffer.duration;
    
    source.start(0, offset);
    startTimeRef.current = ctx.currentTime - offset;
    sourceNodeRef.current = source;
    
    source.onended = () => {
        // Only reset if we reached the end naturally, not if we stopped it manually
        if (ctx.currentTime - startTimeRef.current >= audioBuffer.duration - 0.1) {
             setIsPlaying(false);
             pauseTimeRef.current = 0;
        }
    };

    setIsPlaying(true);
  };

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
        pauseTimeRef.current = audioContextRef.current.currentTime - startTimeRef.current;
    }
    setIsPlaying(false);
  };

  const resetAudio = () => {
      stopAudio();
      pauseTimeRef.current = 0;
  }

  const togglePlay = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      playAudio();
    }
  };

  const renderAnnotatedText = (line: DialogueLine) => {
    if (!line.annotations || line.annotations.length === 0) {
      return line.text;
    }

    let result: React.ReactNode[] = [line.text];

    line.annotations.forEach((annotation: Annotation) => {
      const newResult: React.ReactNode[] = [];
      result.forEach(part => {
        if (typeof part === 'string') {
          const parts = part.split(new RegExp(`(${annotation.phrase})`, 'gi'));
          parts.forEach((subPart, i) => {
            if (subPart.toLowerCase() === annotation.phrase.toLowerCase()) {
              newResult.push(
                <span 
                  key={`${annotation.phrase}-${i}`} 
                  className="group relative cursor-help inline-block focus:outline-none"
                  tabIndex={0}
                >
                  <span className="border-b-2 border-amber-500/50 group-hover:border-amber-400 group-focus:border-amber-400 bg-amber-500/10 group-focus:bg-amber-500/30 px-0.5 rounded transition-colors text-amber-800 dark:text-amber-100 font-medium group-focus:ring-2 group-focus:ring-amber-500/40">
                    {subPart}
                  </span>
                  <span className={`transition-all duration-300 absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 text-stone-800 dark:text-slate-200 text-xs rounded-lg whitespace-normal min-w-[200px] shadow-xl z-50 pointer-events-none ${
                    showAnnotations 
                      ? 'visible opacity-100' 
                      : 'invisible group-hover:visible group-focus:visible opacity-0 group-hover:opacity-100 group-focus:opacity-100'
                  }`}>
                    <span className="font-bold text-amber-600 dark:text-amber-400 block mb-1 uppercase tracking-wider text-[10px]">{annotation.phrase}</span>
                    {annotation.explanation}
                    <span className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1/2 border-8 border-transparent border-t-white dark:border-t-slate-900"></span>
                  </span>
                </span>
              );
            } else {
               newResult.push(subPart);
            }
          });
        } else {
          newResult.push(part);
        }
      });
      result = newResult;
    });

    return result;
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      {/* Historical Context Card */}
      <div className="bg-white/80 dark:bg-slate-800/80 border border-stone-200 dark:border-slate-600 rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden group transition-colors duration-300">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 opacity-75"></div>
        <h2 className="font-serif-display text-2xl md:text-3xl text-amber-900 dark:text-amber-50 mb-4 tracking-wide transition-colors">Historical Snapshot</h2>
        <p className="text-stone-700 dark:text-slate-300 leading-relaxed text-lg font-light transition-colors">
          {scenario.context}
        </p>

        {/* Dramatis Personae */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-stone-200 dark:border-slate-700/50 pt-8 transition-colors">
           {scenario.characters.map((char, idx) => (
             <div key={idx} className="flex flex-col items-center group">
                <div className="relative mb-4">
                    {char.avatarUrl ? (
                        <div className="w-32 h-32 md:w-40 md:h-40 rounded-full p-1 bg-gradient-to-br from-amber-500/30 to-orange-500/30 ring-1 ring-stone-300 dark:ring-slate-600 shadow-2xl overflow-hidden relative transition-all">
                             <img 
                                src={char.avatarUrl} 
                                alt={char.name} 
                                className="w-full h-full object-cover rounded-full transition-transform duration-700 group-hover:scale-105"
                             />
                        </div>
                    ) : (
                        <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-stone-200 dark:bg-slate-700/50 flex items-center justify-center ring-1 ring-stone-300 dark:ring-slate-600 transition-colors">
                            <UserIcon size={48} className="text-stone-400 dark:text-slate-500" />
                        </div>
                    )}
                </div>
                <div className="text-center w-full px-2">
                    <h4 className="font-serif-display text-xl md:text-2xl text-amber-800 dark:text-amber-200 mb-2 transition-colors">{char.name}</h4>
                    {char.bio && (
                        <p className="text-sm text-stone-600 dark:text-slate-400 font-light leading-relaxed transition-colors">
                            {char.bio}
                        </p>
                    )}
                    {/* Fallback to visual description if bio is missing (e.g. older caches) but prefer bio */}
                    {!char.bio && char.visualDescription && (
                         <p className="text-sm text-stone-500 dark:text-slate-500 font-light italic mt-1 transition-colors">
                            {char.visualDescription}
                        </p>
                    )}
                </div>
             </div>
           ))}
        </div>

        {(scenario.sources && scenario.sources.length > 0) && (
          <div className="mt-8 pt-6 border-t border-stone-200 dark:border-slate-700/50 transition-colors">
            <button
              type="button"
              onClick={() => setShowSources(!showSources)}
              className="w-full flex items-center justify-between group focus:outline-none"
            >
                <h4 className="text-xs uppercase tracking-wider text-stone-500 dark:text-slate-500 font-semibold flex items-center gap-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                  <ExternalLinkIcon size={12} /> Sources & Citations ({scenario.sources.length})
                </h4>
                <div className={`transform transition-transform duration-200 ${showSources ? 'rotate-180' : ''}`}>
                    <ChevronDownIcon size={16} className="text-stone-400 dark:text-slate-500 group-hover:text-amber-600 dark:group-hover:text-amber-400" />
                </div>
            </button>
            
            {showSources && (
              <div className="mt-4 flex flex-wrap gap-2 animate-in slide-in-from-top-2 fade-in duration-300">
                {scenario.sources.map((source, idx) => (
                  <a 
                    key={idx} 
                    href={source.uri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="group flex items-center gap-2 max-w-full bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg px-3 py-2 hover:border-amber-500 dark:hover:border-amber-500 hover:shadow-md transition-all duration-200"
                    title={source.title}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-700 dark:text-slate-300 truncate group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                        {source.title}
                      </p>
                      <p className="text-[10px] text-stone-400 dark:text-slate-500 truncate">
                        {new URL(source.uri).hostname}
                      </p>
                    </div>
                    <ExternalLinkIcon size={10} className="text-stone-300 dark:text-slate-600 group-hover:text-amber-500 dark:group-hover:text-amber-400 flex-shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audio Player Card */}
      <div className="bg-gradient-to-br from-amber-100/50 to-stone-200/50 dark:from-amber-900/20 dark:to-slate-900/40 border border-amber-500/30 rounded-2xl p-6 flex flex-col items-center justify-center space-y-6 backdrop-blur-md transition-colors duration-300">
        <div className="flex items-center gap-6">
            <button 
                onClick={resetAudio}
                className="p-3 rounded-full text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-200 dark:hover:bg-slate-800 transition-colors"
                title="Reset"
            >
                <RotateCcwIcon size={24} />
            </button>

            <button
            onClick={togglePlay}
            disabled={!audioBuffer}
            className="w-20 h-20 rounded-full bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/30 flex items-center justify-center transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
            {isPlaying ? <PauseIcon size={32} fill="currentColor" /> : <PlayIcon size={32} fill="currentColor" className="ml-1" />}
            </button>
        </div>

        <p className="text-sm text-amber-900/60 dark:text-amber-200/60 font-mono tracking-wider transition-colors">
            {isPlaying ? 'PLAYING AUDIO...' : 'AUDIO READY'}
        </p>
      </div>

      {/* Script Display */}
      <div className="space-y-6 px-2 md:px-8 pb-12">
        <div className="flex flex-col items-center gap-3 mb-6">
            <h3 className="text-center text-stone-500 dark:text-slate-400 text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors">
            Transcript <InfoIcon size={14} className="text-stone-400 dark:text-slate-500" />
            </h3>
            <button
                onClick={() => setShowAnnotations(prev => !prev)}
                className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 bg-amber-100/50 dark:bg-amber-900/20 hover:bg-amber-200/50 dark:hover:bg-amber-900/40 border border-amber-500/30 px-3 py-1.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
                {showAnnotations ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
                {showAnnotations ? 'Hide Context hints' : 'Show All Context Hints'}
            </button>
        </div>

        <div className="space-y-10 font-serif-display">
          {scenario.script.map((line, idx) => (
            <div key={idx} className={`flex flex-col ${idx % 2 === 0 ? 'items-start' : 'items-end'}`}>
              <div className={`flex gap-4 max-w-[90%] md:max-w-[80%] ${idx % 2 === 0 ? 'flex-row' : 'flex-row-reverse text-right'}`}>
                 
                 {/* Small Avatar next to line */}
                 <div className="flex-shrink-0 mt-1">
                    {(() => {
                        // Find matching character
                        const char = scenario.characters.find(c => c.name === line.speaker) || scenario.characters[0];
                        return char?.avatarUrl ? (
                            <img src={char.avatarUrl} alt={char.name} className="w-10 h-10 rounded-full object-cover border border-stone-300 dark:border-slate-600 shadow-sm" />
                        ) : (
                             <div className="w-10 h-10 rounded-full bg-stone-200 dark:bg-slate-700 border border-stone-300 dark:border-slate-600 flex items-center justify-center text-xs text-stone-500 dark:text-slate-400">
                                {char?.name?.[0] || "?"}
                             </div>
                        );
                    })()}
                 </div>

                 <div className="space-y-2">
                    <span className="text-xs text-amber-700 dark:text-amber-500 font-bold tracking-wider uppercase block transition-colors">
                    {line.speaker}
                    </span>
                    <p className="text-xl md:text-2xl text-stone-800 dark:text-slate-200 leading-snug transition-colors">
                    "{renderAnnotatedText(line)}"
                    </p>
                    {line.translation && (
                    <p className="text-sm md:text-base text-stone-500 dark:text-slate-400 italic font-sans border-l-2 border-stone-300 dark:border-slate-700 pl-3 mt-2 transition-colors">
                        "{line.translation}"
                    </p>
                    )}
                 </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};