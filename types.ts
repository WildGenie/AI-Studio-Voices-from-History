/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface Character {
  name: string;
  gender: 'male' | 'female';
  voice: 'Puck' | 'Kore' | 'Fenrir' | 'Charon' | 'Zephyr' | 'Aoede';
  visualDescription?: string;
  avatarUrl?: string;
  bio?: string;
}

export interface Annotation {
  phrase: string;
  explanation: string;
}

export interface DialogueLine {
  speaker: string;
  text: string;
  translation: string;
  annotations?: Annotation[];
}

export interface Source {
  title: string;
  uri: string;
}

export interface HistoricalScenario {
  context: string;
  accentProfile: string;
  characters: Character[];
  script: DialogueLine[];
  sources: Source[];
}

export interface Coordinate {
  lat: number;
  lng: number;
}