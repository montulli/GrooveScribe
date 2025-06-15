#!/bin/bash

# Script to deploy GrooveScribe to MAMP htdocs directory
# Usage: ./deploy_to_mamp.sh [destination_folder_name]

# Default destination folder name is 'groove'
DEST_FOLDER=${1:-groove}
MAMP_PATH="/Applications/MAMP/htdocs"
DEST_PATH="$MAMP_PATH/$DEST_FOLDER"

# Initialize file counter
TOTAL_FILES=0

echo "Deploying GrooveScribe to $DEST_PATH..."

# Function to count and copy files
count_and_copy() {
    local source_pattern="$1"
    local dest_path="$2"
    local description="$3"
    
    if [ -n "$(ls $source_pattern 2>/dev/null)" ]; then
        local file_count=$(ls $source_pattern 2>/dev/null | wc -l | tr -d ' ')
        cp $source_pattern "$dest_path/"
        TOTAL_FILES=$((TOTAL_FILES + file_count))
        echo "  ✓ Copied $file_count $description files"
    else
        echo "  - No $description files found"
    fi
}

# Function to count and copy directories recursively
count_and_copy_dir() {
    local source_dir="$1"
    local dest_path="$2"
    local description="$3"
    
    if [ -d "$source_dir" ]; then
        local file_count=$(find "$source_dir" -type f 2>/dev/null | wc -l | tr -d ' ')
        cp -r "$source_dir"/* "$dest_path/" 2>/dev/null
        TOTAL_FILES=$((TOTAL_FILES + file_count))
        echo "  ✓ Copied $file_count $description files"
    else
        echo "  - No $description directory found"
    fi
}

# Create destination directory if it doesn't exist
mkdir -p "$DEST_PATH"

echo "Copying files..."

# Main HTML files
echo "📄 HTML files:"
count_and_copy "*.html" "$DEST_PATH" "HTML"

# Manifest files
echo "📋 Manifest files:"
count_and_copy "*.manifest" "$DEST_PATH" "manifest"

# JavaScript files
echo "⚡ JavaScript files:"
mkdir -p "$DEST_PATH/js"
count_and_copy_dir "js" "$DEST_PATH/js" "JavaScript"

# CSS files
echo "🎨 CSS files:"
mkdir -p "$DEST_PATH/css"
count_and_copy_dir "css" "$DEST_PATH/css" "CSS"

# Images
echo "🖼️  Image files:"
mkdir -p "$DEST_PATH/images"
count_and_copy_dir "images" "$DEST_PATH/images" "image"

# MIDI.js
echo "🎵 MIDI.js files:"
mkdir -p "$DEST_PATH/MIDI.js/js/MIDI"
mkdir -p "$DEST_PATH/MIDI.js/inc"
if [ -d "MIDI.js/js" ]; then
    midi_js_count=$(find "MIDI.js/js" -type f 2>/dev/null | wc -l | tr -d ' ')
    cp -r MIDI.js/js/* "$DEST_PATH/MIDI.js/js/" 2>/dev/null
    TOTAL_FILES=$((TOTAL_FILES + midi_js_count))
    echo "  ✓ Copied $midi_js_count MIDI.js JavaScript files"
else
    echo "  - No MIDI.js JavaScript files found"
fi

if [ -d "MIDI.js/inc" ]; then
    midi_inc_count=$(find "MIDI.js/inc" -type f 2>/dev/null | wc -l | tr -d ' ')
    cp -r MIDI.js/inc/* "$DEST_PATH/MIDI.js/inc/" 2>/dev/null
    TOTAL_FILES=$((TOTAL_FILES + midi_inc_count))
    echo "  ✓ Copied $midi_inc_count MIDI.js include files"
else
    echo "  - No MIDI.js include files found"
fi

# Soundfont
echo "🔊 Soundfont files:"
mkdir -p "$DEST_PATH/soundfont"
count_and_copy "soundfont/*.js" "$DEST_PATH/soundfont" "soundfont"
# Also copy the NewDrumSamples directory with MP3 files
if [ -d "soundfont/NewDrumSamples" ]; then
    cp -r "soundfont/NewDrumSamples" "$DEST_PATH/soundfont/"
    mp3_count=$(find "soundfont/NewDrumSamples" -name "*.mp3" 2>/dev/null | wc -l | tr -d ' ')
    TOTAL_FILES=$((TOTAL_FILES + mp3_count))
    echo "  ✓ Copied $mp3_count MP3 drum samples"
else
    echo "  - No NewDrumSamples directory found"
fi

# Font Awesome
echo "🔤 Font Awesome files:"
mkdir -p "$DEST_PATH/font-awesome"
count_and_copy_dir "font-awesome" "$DEST_PATH/font-awesome" "Font Awesome"

# JSTools (optional)
# echo "🔧 JSTools files:"
# mkdir -p "$DEST_PATH/jstools"
# count_and_copy_dir "jstools" "$DEST_PATH/jstools" "JSTools"

echo ""
echo "🎉 Deployment complete!"
echo "📊 Total files copied: $TOTAL_FILES"
echo "🌐 Your application is now available at: http://localhost:8888/$DEST_FOLDER/"

# Optional: Show disk usage of deployed files
if command -v du &> /dev/null; then
    echo "💾 Deployed size: $(du -sh "$DEST_PATH" | cut -f1)"
fi