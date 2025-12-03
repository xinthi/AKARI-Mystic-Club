# Favicon Setup Instructions

## Current Status
- ✅ SVG logo created at `src/web/public/logo.svg`
- ✅ Next.js `_document.tsx` configured to use favicons
- ✅ Logo component created and integrated into Portal and MiniApp

## Next Steps: Generate Favicon Files

Since I cannot directly edit images, you'll need to generate the favicon files from the SVG logo. Here are the recommended methods:

### Option 1: Online Tools (Easiest)
1. Visit https://realfavicongenerator.net/ or https://favicon.io/
2. Upload `src/web/public/logo.svg`
3. Generate and download the favicon package
4. Extract the following files to `src/web/public/`:
   - `favicon.ico`
   - `favicon-16x16.png`
   - `favicon-32x32.png`
   - `apple-touch-icon.png` (180x180)
   - `favicon-192x192.png`
   - `favicon-512x512.png`

### Option 2: ImageMagick (Command Line)
```bash
# Install ImageMagick first, then:
cd src/web/public

# Convert SVG to PNG at different sizes
magick logo.svg -resize 16x16 favicon-16x16.png
magick logo.svg -resize 32x32 favicon-32x32.png
magick logo.svg -resize 180x180 apple-touch-icon.png
magick logo.svg -resize 192x192 favicon-192x192.png
magick logo.svg -resize 512x512 favicon-512x512.png

# Create ICO file (combines multiple sizes)
magick logo.svg -define icon:auto-resize=16,32,48 favicon.ico
```

### Option 3: Using the Original "MYSTIC HEROES" Image
If you want to use the original image you showed me:

1. **Remove Background:**
   - Use https://www.remove.bg/ or Photoshop/GIMP
   - Upload the "MYSTIC HEROES" image
   - Download the transparent PNG

2. **Resize and Export:**
   - Resize to 512x512px (or larger for high-res)
   - Export as PNG with transparency
   - Save as `src/web/public/logo.png`

3. **Generate Favicons:**
   - Use one of the online tools above with the PNG
   - Or use ImageMagick to convert PNG to all required sizes

4. **Update Logo Component:**
   - Change `src/web/components/Logo.tsx` to use `/logo.png` instead of `/logo.svg`

## Files Already Configured
- ✅ `src/web/pages/_document.tsx` - Favicon links configured
- ✅ `src/web/public/site.webmanifest` - PWA manifest ready
- ✅ `src/web/components/Logo.tsx` - Logo component created
- ✅ Portal and MiniApp both use the Logo component

## Testing
After adding the favicon files:
1. Clear browser cache
2. Visit `http://localhost:3000/portal` - check favicon in browser tab
3. Visit `http://localhost:3000` (MiniApp) - check favicon in browser tab
4. Check mobile - add to home screen to see apple-touch-icon

## Notes
- The SVG logo I created is a simplified version inspired by your "MYSTIC HEROES" design
- If you prefer the exact original design, replace `logo.svg` with your processed image
- All favicon sizes are already referenced in `_document.tsx`, so once you add the files, they'll work automatically

