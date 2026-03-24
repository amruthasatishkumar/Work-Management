# App Icon

Place your `icon.ico` file in this folder.

## How to create icon.ico

1. Choose any image you want as the app icon (PNG or JPG recommended, at least 256×256 px)
2. Go to https://cloudconvert.com/png-to-ico (or https://icoconvert.com)
3. Upload your image
4. Set size to **256x256**
5. Convert and download the `.ico` file
6. Rename it to `icon.ico` and place it in this folder

Once `icon.ico` is present here, running `npm run electron:build` (or the GitHub Actions workflow) will embed it as the installer and app icon.
