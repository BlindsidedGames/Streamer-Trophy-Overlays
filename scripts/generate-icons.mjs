import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), "..");

export const ICON_SOURCE_PATH = resolve(projectRoot, "img", "40-platinum.png");
export const ICON_VARIANT_SIZES = [16, 24, 32, 48, 64, 128, 256];
export const ICON_OUTPUTS = {
  desktopIco: resolve(projectRoot, "build-assets", "icon.ico"),
  desktopPng: resolve(projectRoot, "build-assets", "icon.png"),
  faviconPng: resolve(projectRoot, "public", "favicon.png"),
};

const toPowerShellString = (value) => value.replace(/'/g, "''");

const ensureDirectory = (filePath) => {
  mkdirSync(dirname(filePath), { recursive: true });
};

const renderSquarePng = (sourcePath, size, outputPath) => {
  const powerShellScript = `
Add-Type -AssemblyName System.Drawing

$sourcePath = '${toPowerShellString(sourcePath)}'
$outputPath = '${toPowerShellString(outputPath)}'
$iconSize = ${size}

$source = [System.Drawing.Bitmap]::new($sourcePath)
try {
  $canvas = [System.Drawing.Bitmap]::new($iconSize, $iconSize)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

      $scale = [Math]::Min($iconSize / [double]$source.Width, $iconSize / [double]$source.Height)
      $drawWidth = [Math]::Max(1, [int][Math]::Round($source.Width * $scale))
      $drawHeight = [Math]::Max(1, [int][Math]::Round($source.Height * $scale))
      $offsetX = [int][Math]::Floor(($iconSize - $drawWidth) / 2)
      $offsetY = [int][Math]::Floor(($iconSize - $drawHeight) / 2)
      $destination = [System.Drawing.Rectangle]::new($offsetX, $offsetY, $drawWidth, $drawHeight)

      $graphics.DrawImage($source, $destination)
      $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $graphics.Dispose()
    }
  } finally {
    $canvas.Dispose()
  }
} finally {
  $source.Dispose()
}
`;

  ensureDirectory(outputPath);

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", powerShellScript],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );

  if (result.error || result.status !== 0) {
    const failureMessage = result.error?.message ?? result.stderr.trim() ?? "unknown error";
    throw new Error(`Unable to render ${size}px icon asset: ${failureMessage}`);
  }
};

export const buildIco = (variants) => {
  const header = Buffer.alloc(6 + variants.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(variants.length, 4);

  let offset = header.length;
  const buffers = [header];

  variants.forEach(({ size, png }, index) => {
    const entryOffset = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset);
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(png.length, entryOffset + 8);
    header.writeUInt32LE(offset, entryOffset + 12);

    buffers.push(png);
    offset += png.length;
  });

  return Buffer.concat(buffers);
};

export const generateIcons = () => {
  if (!existsSync(ICON_SOURCE_PATH)) {
    throw new Error(`Transparent icon source not found: ${ICON_SOURCE_PATH}`);
  }

  const tempRoot = mkdtempSync(resolve(tmpdir(), "streamer-tools-icons-"));

  try {
    const variants = ICON_VARIANT_SIZES.map((size) => {
      const outputPath = resolve(tempRoot, `icon-${size}.png`);
      renderSquarePng(ICON_SOURCE_PATH, size, outputPath);
      return {
        size,
        png: readFileSync(outputPath),
      };
    });

    ensureDirectory(ICON_OUTPUTS.desktopPng);
    writeFileSync(ICON_OUTPUTS.desktopPng, variants.at(-1).png);

    ensureDirectory(ICON_OUTPUTS.faviconPng);
    writeFileSync(
      ICON_OUTPUTS.faviconPng,
      variants.find((variant) => variant.size === 64).png,
    );

    ensureDirectory(ICON_OUTPUTS.desktopIco);
    writeFileSync(ICON_OUTPUTS.desktopIco, buildIco(variants));

    for (const outputPath of Object.values(ICON_OUTPUTS)) {
      if (!existsSync(outputPath)) {
        throw new Error(`Icon generation did not produce ${outputPath}`);
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

if (resolve(process.argv[1] ?? "") === scriptPath) {
  generateIcons();
}
