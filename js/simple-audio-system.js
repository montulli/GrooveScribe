/**
 * Simple Audio System for GrooveScribe
 * Uses HTML5 Audio elements to work with local file:// URLs
 * Replaces broken MIDI.js + soundfont system
 */

(function() {
    'use strict';

    // Simple AudioManager using HTML5 Audio
    class SimpleAudioManager {
        constructor() {
            this.isInitialized = false;
            this.audioElements = {};
            this.loadedSamples = 0;
            this.totalSamples = 0;
            
            // MIDI note to drum sample mapping (GrooveScribe specific)
            this.midiToSample = {
                // Kick
                35: 'kick',           // constant_OUR_MIDI_KICK_NORMAL
                
                // Snare variations
                38: 'snare_normal',   // constant_OUR_MIDI_SNARE_NORMAL  
                21: 'snare_ghost',    // constant_OUR_MIDI_SNARE_GHOST
                22: 'snare_accent',   // constant_OUR_MIDI_SNARE_ACCENT
                37: 'snare_xstick',   // constant_OUR_MIDI_SNARE_XSTICK
                25: 'snare_flam',     // constant_OUR_MIDI_SNARE_FLAM
                23: 'snare_drag',     // constant_OUR_MIDI_SNARE_DRAG
                24: 'snare_buzz',     // constant_OUR_MIDI_SNARE_BUZZ
                
                // Hi-hat variations
                42: 'hihat_normal',   // constant_OUR_MIDI_HIHAT_NORMAL
                46: 'hihat_open',     // constant_OUR_MIDI_HIHAT_OPEN
                44: 'hihat_foot',     // constant_OUR_MIDI_HIHAT_FOOT
                26: 'hihat_accent',   // constant_OUR_MIDI_HIHAT_ACCENT
                51: 'ride',           // constant_OUR_MIDI_HIHAT_RIDE
                53: 'ride_bell',      // constant_OUR_MIDI_HIHAT_RIDE_BELL
                56: 'cowbell',        // constant_OUR_MIDI_HIHAT_COW_BELL
                49: 'crash',          // constant_OUR_MIDI_HIHAT_CRASH
                55: 'stacker',        // constant_OUR_MIDI_HIHAT_STACKER
                
                // Toms
                48: 'tom1',           // constant_OUR_MIDI_TOM1_NORMAL (High Tom)
                47: 'tom2',           // constant_OUR_MIDI_TOM2_NORMAL (Mid Tom)
                45: 'tom3',           // constant_OUR_MIDI_TOM3_NORMAL (Low Tom) 
                43: 'tom4',           // constant_OUR_MIDI_TOM4_NORMAL (Floor Tom)
                
                // Metronome
                76: 'metronome_normal',  // constant_OUR_MIDI_HIHAT_METRONOME_NORMAL
                77: 'metronome_accent'   // constant_OUR_MIDI_HIHAT_METRONOME_ACCENT
            };
            
            // Sample file name mapping
            this.sampleFiles = {
                'kick': 'Kick.mp3',
                'snare_normal': 'Snare Normal.mp3',
                'snare_ghost': 'Snare Ghost.mp3', 
                'snare_accent': 'Snare Accent.mp3',
                'snare_xstick': 'Snare Cross Stick.mp3',
                'snare_flam': 'Snare Flam.mp3',
                'snare_drag': 'Drag.mp3',
                'snare_buzz': 'Buzz.mp3',
                'hihat_normal': 'Hi Hat Normal.mp3',
                'hihat_open': 'Hi Hat Open.mp3',
                'hihat_foot': 'Hi Hat Foot.mp3', 
                'hihat_accent': 'Hi Hat Accent.mp3',
                'ride': 'Ride.mp3',
                'ride_bell': 'Bell.mp3',
                'cowbell': 'Cowbell.mp3',
                'crash': 'Crash.mp3',
                'stacker': 'Stacker.mp3',
                'tom1': '10 Tom.mp3',        // High Tom
                'tom2': '16 Tom.mp3',        // Mid Tom  
                'tom3': 'Rack Tom.mp3',      // Low Tom
                'tom4': 'Floor Tom.mp3',     // Floor Tom
                'metronome_normal': 'metronomeClick.mp3',
                'metronome_accent': 'metronome1Count.mp3'
            };
        }

        async initialize() {
            try {
                console.log('Initializing Simple Audio Manager...');
                await this.loadAudioElements();
                this.isInitialized = true;
                console.log('Simple Audio Manager initialized successfully');
                console.log(`Loaded ${this.loadedSamples}/${this.totalSamples} audio samples`);
                return true;
            } catch (error) {
                console.error('Failed to initialize Simple Audio Manager:', error);
                return false;
            }
        }

        async loadAudioElements() {
            const basePath = 'soundfont/NewDrumSamples/MP3/';
            this.totalSamples = Object.keys(this.sampleFiles).length;
            this.loadedSamples = 0;

            const loadPromises = Object.entries(this.sampleFiles).map(([sampleName, fileName]) => {
                return new Promise((resolve) => {
                    const audio = new Audio();
                    const url = basePath + fileName;
                    
                    audio.addEventListener('canplaythrough', () => {
                        this.audioElements[sampleName] = audio;
                        this.loadedSamples++;
                        console.log(`Loaded audio sample: ${sampleName}`);
                        resolve(true);
                    });
                    
                    audio.addEventListener('error', (e) => {
                        console.warn(`Failed to load audio sample: ${sampleName} (${fileName})`);
                        resolve(false);
                    });
                    
                    // Set audio properties for better performance
                    audio.preload = 'auto';
                    audio.volume = 1.0;
                    
                    // Start loading
                    audio.src = url;
                    audio.load();
                });
            });

            await Promise.all(loadPromises);
            console.log(`Audio loading complete: ${this.loadedSamples}/${this.totalSamples} samples loaded`);
        }

        // Main API method - plays a drum sound by MIDI note number
        playMidiNote(channel, midiNote, velocity = 127, delay = 0) {
            if (!this.isInitialized) {
                console.warn('Simple Audio Manager not initialized');
                return false;
            }

            const sampleName = this.midiToSample[midiNote];
            if (!sampleName) {
                console.warn(`No sample mapping for MIDI note: ${midiNote}`);
                return false;
            }

            const normalizedVelocity = Math.max(0.1, Math.min(1.0, velocity / 127));
            return this.playSample(sampleName, normalizedVelocity, delay);
        }

        // Play audio sample using HTML5 Audio
        playSample(sampleName, velocity = 1.0, delay = 0) {
            const audio = this.audioElements[sampleName];
            if (!audio) {
                console.warn(`Audio sample not found: ${sampleName}`);
                return false;
            }

            try {
                // Clone the audio element to allow overlapping plays
                const audioClone = audio.cloneNode();
                audioClone.volume = Math.max(0.1, Math.min(1.0, velocity));
                
                if (delay > 0) {
                    setTimeout(() => {
                        audioClone.play().catch(e => console.warn(`Play failed for ${sampleName}:`, e));
                    }, delay * 1000);
                } else {
                    audioClone.play().catch(e => console.warn(`Play failed for ${sampleName}:`, e));
                }
                
                return true;
            } catch (error) {
                console.error(`Failed to play sample ${sampleName}:`, error);
                return false;
            }
        }

        // Get available samples for debugging
        getAvailableSamples() {
            return Object.keys(this.audioElements);
        }

        // Get MIDI mapping for debugging
        getMidiMapping() {
            return this.midiToSample;
        }

        // Get loading status
        getLoadingStatus() {
            return {
                loaded: this.loadedSamples,
                total: this.totalSamples,
                percentage: Math.round((this.loadedSamples / this.totalSamples) * 100)
            };
        }
    }

    // GrooveScribe Audio Integration
    class GrooveScribeSimpleAudio {
        constructor() {
            this.audioManager = null;
            this.initialized = false;
        }

        async init() {
            try {
                console.log('Initializing simple audio system...');
                this.audioManager = new SimpleAudioManager();
                const success = await this.audioManager.initialize();
                
                if (success) {
                    // Create MIDI.js bridge for backward compatibility
                    this.createMidiJsBridge();
                    
                    // Replace the broken play_single_note_for_note_setting function
                    this.replaceBrokenAudioFunctions();
                    
                    // Add modern enhancements
                    this.addAudioEnhancements();
                    
                    this.initialized = true;
                    console.log('Simple audio system initialized successfully');
                } else {
                    console.warn('Simple audio system initialization failed');
                }
                
            } catch (error) {
                console.error('Failed to initialize simple audio system:', error);
            }
        }

        createMidiJsBridge() {
            // Create a replacement for MIDI.js that uses our Simple Audio Manager
            if (!window.MIDI) {
                window.MIDI = {};
            }

            const self = this;

            // Replace MIDI.WebAudio with our simple system
            window.MIDI.WebAudio = {
                noteOn: (channel, note, velocity, delay) => {
                    if (self.audioManager) {
                        return self.audioManager.playMidiNote(channel, note, velocity, delay);
                    }
                    return false;
                },
                noteOff: () => {
                    // Note off is not needed for drum samples (they're one-shots)
                    return true;
                },
                stopAllNotes: () => {
                    // Not implemented for drum samples
                    return true;
                }
            };

            // Also replace MIDI.AudioTag for full compatibility
            window.MIDI.AudioTag = {
                noteOn: (channel, note, velocity, delay) => {
                    if (self.audioManager) {
                        return self.audioManager.playMidiNote(channel, note, velocity, delay);
                    }
                    return false;
                },
                noteOff: () => {
                    return true;
                }
            };

            console.log('MIDI.js bridge created successfully (Simple Audio)');
        }

        replaceBrokenAudioFunctions() {
            const self = this;
            
            // Replace the global play_single_note_for_note_setting function
            window.play_single_note_for_note_setting = (note_val) => {
                if (self.audioManager && self.audioManager.isInitialized) {
                    return self.audioManager.playMidiNote(9, note_val, 127, 0);
                } else {
                    console.warn('Simple Audio Manager not available');
                    return false;
                }
            };

            console.log('Audio functions replaced with simple implementation');
        }

        addAudioEnhancements() {
            // Add audio enhancements
            if (this.audioManager) {
                // Expose audio manager globally for debugging
                window.simpleAudioManager = this.audioManager;
                window.modernAudioManager = this.audioManager; // For compatibility with tests
                
                // Add audio test function
                window.testDrumSound = (midiNote) => {
                    if (this.audioManager) {
                        const result = this.audioManager.playMidiNote(9, midiNote, 127, 0);
                        console.log(`Testing MIDI note ${midiNote}: ${result ? 'SUCCESS' : 'FAILED'}`);
                        return result;
                    }
                    return false;
                };

                // Add function to get available samples
                window.getAvailableAudioSamples = () => {
                    if (this.audioManager) {
                        return this.audioManager.getAvailableSamples();
                    }
                    return [];
                };

                // Add MIDI mapping debugging
                window.getMidiMapping = () => {
                    if (this.audioManager) {
                        return this.audioManager.getMidiMapping();
                    }
                    return {};
                };

                // Add loading status check
                window.getAudioLoadingStatus = () => {
                    if (this.audioManager) {
                        return this.audioManager.getLoadingStatus();
                    }
                    return { loaded: 0, total: 0, percentage: 0 };
                };

                console.log('Audio enhancements added successfully');
            }
        }
    }

    // Initialize the simple audio system when DOM is ready
    function initializeSimpleAudio() {
        const grooveScribeAudio = new GrooveScribeSimpleAudio();
        
        // Wait for page to be fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => grooveScribeAudio.init(), 100);
            });
        } else {
            setTimeout(() => grooveScribeAudio.init(), 100);
        }

        // Make it globally accessible
        window.grooveScribeSimpleAudio = grooveScribeAudio;
    }

    // Start initialization
    initializeSimpleAudio();

})(); 