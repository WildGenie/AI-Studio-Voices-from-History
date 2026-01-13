/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse, HarmCategory, HarmBlockThreshold, Modality } from "@google/genai";
import { HistoricalScenario, Source } from "../types";
import { decodeBase64, decodeAudioData } from "../utils/audioUtils";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Using Gemini 3 Pro for research as requested
const RESEARCH_MODEL = 'gemini-3-pro-preview';
// Using the standard TTS model
const TTS_MODEL = 'gemini-2.5-pro-tts-preview-12-2025';
// Image model
const IMAGE_MODEL = 'gemini-2.5-flash-image';

// Retry Configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 2000;

/**
 * Executes a function with exponential backoff retry logic for 429/Quota errors.
 */
async function withRetry<T>(operation: () => Promise<T>, retries = MAX_RETRIES, delay = INITIAL_DELAY_MS): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isQuotaError = 
      error?.status === 429 || 
      error?.code === 429 || 
      (error?.message && (error.message.includes('429') || error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED')));

    if (isQuotaError && retries > 0) {
      console.warn(`Quota limit hit. Retrying in ${delay}ms... (${retries} attempts remaining)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }

    throw error;
  }
}

function extractJSON(text: string): any {
  if (!text) return null;

  let jsonString = text.trim();
  
  // Remove markdown code blocks if present
  jsonString = jsonString.replace(/```json/gi, '').replace(/```/g, '');
  
  // Find the first '{' and last '}'
  const firstOpen = jsonString.indexOf('{');
  const lastClose = jsonString.lastIndexOf('}');
  
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    jsonString = jsonString.substring(firstOpen, lastClose + 1);
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      // Attempt to clean control characters that might break JSON
      try {
        const cleaned = jsonString.replace(/[\u0000-\u001F]+/g, "");
        return JSON.parse(cleaned);
      } catch (e2) {
        console.error("JSON Parse Error on string:", jsonString);
        throw new Error("Model returned invalid JSON format.");
      }
    }
  }
  
  throw new Error("No JSON object found in response.");
}

export async function researchLocationAndDate(location: string, date: string): Promise<HistoricalScenario> {
  const prompt = `
    You are an expert historical researcher.
    TASK: Research the historical context and atmosphere at this location: "${location}" on the date ${date}.
    
    STEP 1: MANDATORY RESEARCH
    You MUST use the Google Search tool to find verified historical details for this specific date and location.
    Search for:
    - Specific historical events happening in this region around ${date}.
    - Authentic local customs, clothing, and trade items of the era.
    - Sensory details (sights, sounds, smells) specific to this place and time.
    
    STEP 2: CREATE SCENARIO
    Based on your research, create a plausible, immersive historical fiction scenario.
    **DO NOT REFUSE TO ANSWER** due to lack of specific historical records. If exact details are missing, extrapolate based on general historical knowledge of the era found via search.

    Then, write a short, naturalistic dialogue (approx 6-8 lines total) between two fictional characters present at that spot and time.
    The conversation should feel like a 'verite' snapshot—overheard, authentic, and grounded in the sensory details of that specific moment.

    CRITICAL INSTRUCTION: Write the dialogue in the NATIVE LANGUAGE appropriate for that specific location and time period (e.g., French for Paris, Old English for 1000AD London, Japanese for Kyoto).
    
    Write an English translation for each line of dialogue.

    Determine the appropriate accent or dialect description for these characters.

    If the dialogue uses specific historical terms, slang, or references that might be obscure to a modern listener, provide brief annotations explaining them.

    Assign each character a gender ('male' or 'female') and a voice persona from the following lists:
    - Male Voices: ['Puck', 'Fenrir', 'Charon', 'Zephyr']
    - Female Voices: ['Kore', 'Aoede']
    
    IMPORTANT: Ensure the voice matches the character's gender. Ensure the two characters have DISTINCT voices.

    Output strictly valid JSON (do not use markdown code blocks) with this structure:
    {
      "context": "A evocative description of the setting, time of day, and historical atmosphere.",
      "accentProfile": "Description of the accent/dialect for the audio model.",
      "characters": [
        {
          "name": "Character Name", 
          "gender": "male",
          "voice": "VoiceName",
          "visualDescription": "A detailed visual description of the character's appearance, age, and period-appropriate clothing for generating a portrait.",
          "bio": "A brief but compelling backstory, role, and personality description. Do NOT describe their visual appearance here."
        },
        {
          "name": "Character Name",
          "gender": "female", 
          "voice": "VoiceName",
          "visualDescription": "A detailed visual description...",
          "bio": "A brief but compelling backstory..."
        }
      ],
      "script": [
        {
          "speaker": "Character Name", 
          "text": "The line of dialogue in the NATIVE LANGUAGE.",
          "translation": "The English translation of this line.",
          "annotations": [
            { "phrase": "specific term in native text", "explanation": "Brief historical context or definition." }
          ]
        }
      ]
    }
  `;

  try {
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: RESEARCH_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // Add safety settings to prevent blocking historical content (battles, etc.)
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        ],
      }
    }));

    // Check if the response was blocked
    if (response.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error("The request was blocked by safety filters. Please try a different location or topic.");
    }

    const text = response.text; // Access text directly via getter
    
    // Extract Sources from grounding
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const groundingChunks = groundingMetadata?.groundingChunks || [];
    
    const sourcesMap = new Map<string, Source>();
    if (groundingChunks) {
      groundingChunks.forEach((chunk: any) => {
        // We look for 'web' chunks specifically as they contain the URI and Title
        if (chunk.web?.uri) {
            const uri = chunk.web.uri;
            const title = chunk.web.title || new URL(uri).hostname;
            if (!sourcesMap.has(uri)) {
                sourcesMap.set(uri, { title, uri });
            }
        }
      });
    }
    const sources = Array.from(sourcesMap.values());

    console.log("Grounding Metadata:", groundingMetadata);
    console.log("Extracted Sources:", sources);

    const data = extractJSON(text);

    if (!data) {
        throw new Error("Empty response from model.");
    }

    // --- ROBUST DATA NORMALIZATION ---

    // 1. Ensure Characters Array Exists and has at least 2 entries
    if (!data.characters || !Array.isArray(data.characters)) {
        data.characters = [];
    }
    
    const maleVoices = ['Puck', 'Fenrir', 'Charon', 'Zephyr'];
    const femaleVoices = ['Kore', 'Aoede'];
    // const allVoices = [...maleVoices, ...femaleVoices]; // Unused

    // Pad with defaults if missing
    while (data.characters.length < 2) {
        const nextId = data.characters.length + 1;
        // Alternate genders/voices for defaults
        const isMale = nextId % 2 !== 0; 
        data.characters.push({ 
          name: `Speaker ${nextId}`, 
          gender: isMale ? 'male' : 'female',
          voice: isMale ? 'Puck' : 'Kore',
          visualDescription: "A person from this historical period.",
          bio: "A local inhabitant of this era."
        });
    }
    
    // Trim to strictly 2 characters
    data.characters = data.characters.slice(0, 2);

    // Sanitize names to be clean strings
    data.characters.forEach((c: any) => {
        c.name = String(c.name).trim();
        // Default to male if gender is missing or invalid
        if (c.gender !== 'male' && c.gender !== 'female') {
            c.gender = 'male'; 
        }
    });

    // Ensure distinct names (append 1/2 if identical)
    if (data.characters[0].name === data.characters[1].name) {
        data.characters[0].name = `${data.characters[0].name} (1)`;
        data.characters[1].name = `${data.characters[1].name} (2)`;
    }

    // 2. Enforce Gender-Voice Consistency and Distinctness
    const char1 = data.characters[0];
    const char2 = data.characters[1];

    const getValidVoice = (char: any, takenVoice?: string) => {
        const voiceList = char.gender === 'female' ? femaleVoices : maleVoices;
        // Try to keep current voice if valid
        if (voiceList.includes(char.voice) && char.voice !== takenVoice) {
            return char.voice;
        }
        // Pick random available
        const available = voiceList.filter(v => v !== takenVoice);
        if (available.length > 0) {
            return available[Math.floor(Math.random() * available.length)];
        }
        // Fallback to any valid voice for gender (ignoring taken constraint if absolutely necessary)
        return voiceList[Math.floor(Math.random() * voiceList.length)];
    };

    char1.voice = getValidVoice(char1);
    char2.voice = getValidVoice(char2, char1.voice);

    // 3. Normalize Script Speakers
    if (!data.script || !Array.isArray(data.script)) {
        data.script = [];
    }

    // Count speaker frequency in script to help mapping
    const speakerCounts: Record<string, number> = {};
    data.script.forEach((line: any) => {
        if (!line.speaker) line.speaker = "Unknown";
        line.speaker = String(line.speaker).trim();
        speakerCounts[line.speaker] = (speakerCounts[line.speaker] || 0) + 1;
    });

    const scriptSpeakers = Object.keys(speakerCounts).sort((a,b) => speakerCounts[b] - speakerCounts[a]);
    const speakerMap: Record<string, string> = {};

    scriptSpeakers.forEach((s) => {
        const sLower = s.toLowerCase();
        const c1Lower = char1.name.toLowerCase();
        const c2Lower = char2.name.toLowerCase();

        // Try fuzzy matching
        if (s === char1.name || c1Lower.includes(sLower) || sLower.includes(c1Lower)) {
            speakerMap[s] = char1.name;
        } else if (s === char2.name || c2Lower.includes(sLower) || sLower.includes(c2Lower)) {
            speakerMap[s] = char2.name;
        }
    });

    // Handle unmapped speakers
    const unmapped = scriptSpeakers.filter(s => !speakerMap[s]);
    let unmappedIndex = 0;

    // Helper to check if a character has been assigned any lines
    const isChar1Used = () => Object.values(speakerMap).includes(char1.name);
    const isChar2Used = () => Object.values(speakerMap).includes(char2.name);

    // Prioritize ensuring both characters have at least one speaker mapping
    if (!isChar1Used() && unmapped[unmappedIndex]) {
        speakerMap[unmapped[unmappedIndex]] = char1.name;
        unmappedIndex++;
    }
    if (!isChar2Used() && unmapped[unmappedIndex]) {
        speakerMap[unmapped[unmappedIndex]] = char2.name;
        unmappedIndex++;
    }

    // Assign remaining unmapped speakers
    while(unmappedIndex < unmapped.length) {
         speakerMap[unmapped[unmappedIndex]] = char1.name;
         unmappedIndex++;
    }

    // Apply mapping to script
    data.script.forEach((line: any) => {
        if (speakerMap[line.speaker]) {
            line.speaker = speakerMap[line.speaker];
        } else {
            line.speaker = char1.name; 
        }
    });

    return {
      ...data,
      sources
    };

  } catch (error) {
    console.error("Research Error:", error);
    
    // Determine the error type
    const message = error instanceof Error ? error.message : String(error);
    const isQuotaError = message.includes('429') || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED');
    
    if (isQuotaError) {
        throw new Error("The system is currently busy (Quota Exceeded). Please try again in a moment.");
    } else {
        // Pass through the specific error (e.g. "Invalid JSON format", "Empty response", "Safety block")
        // instead of masking it, to help with debugging.
        throw new Error(`Research failed: ${message}`);
    }
  }
}

export async function generateDialogueAudio(scenario: HistoricalScenario): Promise<AudioBuffer> {
  // Use safe, simple names for the TTS generation to prevent model parsing errors with complex names.
  // We map the display names (e.g. "Jean-Pierre") to "Speaker A" and "Speaker B" internally.
  const charToSafeName = new Map<string, string>();
  const speakerVoiceConfigs: any[] = [];
  
  // We strictly support 2 speakers for now based on the research logic
  const safeNames = ["Speaker A", "Speaker B"];

  scenario.characters.forEach((char, index) => {
    const safeName = safeNames[index] || `Speaker ${String.fromCharCode(65 + index)}`;
    charToSafeName.set(char.name, safeName);

    speakerVoiceConfigs.push({
      speaker: safeName,
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: char.voice }
      }
    });
  });

  // Inner function to perform the actual generation attempt
  const performGeneration = async (useTranslation: boolean): Promise<AudioBuffer> => {
      let dialogueText = "";
      scenario.script.forEach(line => {
        // Map the script speaker to the safe name. 
        const safeName = charToSafeName.get(line.speaker) || safeNames[0];
        const textContent = useTranslation ? line.translation : line.text;
        
        // Basic cleaning: remove actions in asterisks e.g. *coughs*
        const cleanText = textContent.replace(/\*[^*]+\*/g, '').trim();
        
        if (cleanText) {
             dialogueText += `${safeName}: ${cleanText}\n`;
        }
      });

      if (!dialogueText.trim()) {
          throw new Error("Dialogue text is empty.");
      }

      const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: TTS_MODEL, 
        contents: [{ parts: [{ text: dialogueText }] }],
        config: {
          responseModalities: [Modality.AUDIO], 
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: speakerVoiceConfigs
            }
          },
          // IMPORTANT: Add safety settings to prevent audio generation from being blocked 
          // on historical topics (which might involve conflict or sensitive themes).
          safetySettings: [
              { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
              { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
              { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
              { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          ],
        }
      }));

      // Improved extraction logic to handle potential multi-part responses
      let base64Audio: string | undefined = undefined;
      
      const parts = response.candidates?.[0]?.content?.parts;
      if (parts) {
          for (const part of parts) {
              if (part.inlineData?.data) {
                  base64Audio = part.inlineData.data;
                  break;
              }
          }
      }

      if (!base64Audio) {
          const finishReason = response.candidates?.[0]?.finishReason;
          
          if (finishReason === 'SAFETY') {
               throw new Error("Audio generation was blocked by safety filters.");
          }
          
          // If finish reason is OTHER, it often means language unsupported or model error.
          throw new Error(`No audio data returned from the model (Finish Reason: ${finishReason || 'UNKNOWN'}).`);
      }

      // Decode audio
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass({ sampleRate: 24000 });
      
      const audioBuffer = await decodeAudioData(
        decodeBase64(base64Audio),
        audioContext,
        24000,
        1
      );

      await audioContext.close();

      return audioBuffer;
  };

  try {
    // Attempt 1: Native Language
    return await performGeneration(false);

  } catch (error: any) {
    console.warn("Primary TTS generation failed (likely unsupported language), attempting fallback to English translation.", error);
    
    // Attempt 2: English Translation
    // This fixes the "Finish Reason: OTHER" error which commonly occurs when the model 
    // cannot speak the provided historical language (e.g. Nahuatl, Ancient Greek).
    try {
        return await performGeneration(true);
    } catch (fallbackError: any) {
         // Propagate the actual error message for better UI feedback if both fail
        const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(`Audio generation failed: ${message}`);
    }
  }
}

export async function generateCharacterAvatar(description: string, context: string): Promise<string | null> {
  try {
    const prompt = `Generate a photorealistic, historically accurate headshot portrait of a person matching this description: "${description}".
    Context for clothing and style: ${context}.
    The image should be a close-up character portrait with neutral or subtle expression.
    High quality, authentic details.`;

    // Images are less critical, we can use fewer retries or handle failure gracefully
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [{ text: prompt }]
      },
      // Ensure safety settings for images too
      config: {
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        ],
      }
    }), 2); // Reduced retries for images to save time

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (e) {
    console.warn("Image generation failed:", e);
    // Return null so the UI can fallback to a placeholder
    return null;
  }
}