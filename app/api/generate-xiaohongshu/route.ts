import { NextRequest, NextResponse } from 'next/server';
import { createCanvas, loadImage } from 'canvas';

// 品牌颜色定义 - 参照 brand-next 风格
const COLORS = {
  creamBg1: '#fef9f3', // 最浅奶油色
  creamBg2: '#f6ecdf', // 中奶油色
  creamBg3: '#eedfce', // 深奶油色
  textPrimary: '#2f251f', // 深咖啡色 - 主文字
  textSecondary: '#4d4036', // 深咖啡色（稍浅）- 次要文字
  textMuted: '#7a695b', // 柔和文字
  accent: '#c39b7b', // 强调色
  shadow: 'rgba(108, 82, 64, 0.12)', // 阴影色
  coverTitle: '#2f251f', // Specific for cover main title
  coverSubtitle: '#2f251f', // Specific for cover subtitle
  h1Color: '#3A2F2C', // Inner page H1
  h2Color: '#4B3F3C', // Inner page H2
  bodyColor: '#4B3F3C', // Inner page body
};

// 小红书标准尺寸（竖版 3:4 比例）
const WIDTH = 1242;
const HEIGHT = 1656;

// 绘制圆角矩形（兼容旧版本 canvas）
function drawRoundedRect(
  ctx: any,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// 绘制默认背景
// 绘制默认背景
function drawDefaultBackground(ctx: any, width: number, height: number) {
  // 绘制品牌风格的渐变背景（参照 brand-next）
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, COLORS.creamBg1);
  gradient.addColorStop(0.45, COLORS.creamBg2);
  gradient.addColorStop(1, COLORS.creamBg3);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 添加径向渐变叠加（增加高级感）
  const radial1 = ctx.createRadialGradient(width * 0.15, height * 0.18, 0, width * 0.15, height * 0.18, width * 0.7);
  radial1.addColorStop(0, 'rgba(212, 181, 160, 0.14)');
  radial1.addColorStop(1, 'transparent');
  ctx.fillStyle = radial1;
  ctx.fillRect(0, 0, width, height);

  const radial2 = ctx.createRadialGradient(width * 0.82, height * 0.12, 0, width * 0.82, height * 0.12, width * 0.45);
  radial2.addColorStop(0, 'rgba(189, 149, 127, 0.12)');
  radial2.addColorStop(1, 'transparent');
  ctx.fillStyle = radial2;
  ctx.fillRect(0, 0, width, height);

  // 添加细微纹理（模拟纸张质感）
  ctx.fillStyle = 'rgba(250, 248, 245, 0.2)';
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 1.5;
    ctx.fillRect(x, y, size, size);
  }
}

// 自动换行函数
function wrapText(
  ctx: any,
  text: string,
  maxWidth: number,
  lineHeight: number
): string[] {
  const words = text.split('\n');
  const lines: string[] = [];

  for (const word of words) {
    if (word.trim() === '') {
      lines.push('');
      continue;
    }

    let currentLine = '';
    const chars = word.split('');

    for (const char of chars) {
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine !== '') {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine !== '') {
      lines.push(currentLine);
    }
  }

  return lines;
}

// 将标题强制分成两行的函数
function splitTitleIntoTwoLines(
  ctx: any,
  text: string,
  maxWidth: number
): string[] {
  // 如果文本已经包含换行符，先按换行符分割
  const allParts = text.split('\n');
  const nonEmptyParts = allParts.filter(p => p.trim() !== '');
  
  // 如果完全没有内容，返回两行空
  if (nonEmptyParts.length === 0) return ['', ''];
  
  // 如果已经有多个部分（包括空行），取前两个部分
  if (allParts.length >= 2) {
    return [allParts[0].trim(), allParts[1].trim()];
  }
  
  // 如果只有一个部分，需要智能分割
  const fullText = nonEmptyParts[0];
  
  // 如果文本很短，不需要换行，直接返回两行（第一行有内容，第二行空）
  const fullWidth = ctx.measureText(fullText).width;
  if (fullWidth <= maxWidth) {
    return [fullText, ''];
  }
  
  // 尝试找到最佳分割点（尽量在中间位置）
  const chars = fullText.split('');
  const totalChars = chars.length;
  const targetSplit = Math.floor(totalChars / 2);
  
  // 从中间位置向前后寻找合适的分割点（优先在空格、标点处分割）
  let bestSplit = targetSplit;
  
  // 向前寻找（最多向前找10个字符）
  for (let i = targetSplit; i >= Math.max(0, targetSplit - 10); i--) {
    if (i === 0) {
      bestSplit = 0;
      break;
    }
    const char = chars[i];
    // 优先在空格、逗号、句号等位置分割
    if (char === ' ' || char === '，' || char === '。' || char === '、' || char === '；') {
      bestSplit = i + 1; // 分割点后移一位，不包含标点
      break;
    }
  }
  
  // 如果没找到合适的分割点，向后寻找
  if (bestSplit === targetSplit) {
    for (let i = targetSplit; i < Math.min(totalChars, targetSplit + 10); i++) {
      const char = chars[i];
      if (char === ' ' || char === '，' || char === '。' || char === '、' || char === '；') {
        bestSplit = i + 1;
        break;
      }
    }
  }
  
  // 如果还是没找到，就强制在中间分割
  if (bestSplit === targetSplit) {
    bestSplit = Math.floor(totalChars / 2);
  }
  
  const line1 = chars.slice(0, bestSplit).join('').trim();
  const line2 = chars.slice(bestSplit).join('').trim();
  
  return [line1, line2];
}

export async function POST(request: NextRequest) {
  try {
    const { title, subtitle, content, type, images = [], backgroundImage } = await request.json();

    // 封面模式必须有标题，内页模式必须有标题或内容
    if (type === 'cover' && !title) {
      return NextResponse.json(
        { error: '封面模式需要填写标题' },
        { status: 400 }
      );
    }

    if (type === 'content' && !title && !content) {
      return NextResponse.json(
        { error: '内页模式需要填写标题或正文内容' },
        { status: 400 }
      );
    }

    // 确定画布尺寸
    let canvasWidth = WIDTH;
    let canvasHeight = HEIGHT;

    if (type === 'wechat-cover') {
      canvasWidth = 2350;
      canvasHeight = 1000;
    }

    // 创建画布
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // 如果有背景图片，使用背景图片；否则使用默认渐变背景（封面和内页都支持）
    if (backgroundImage) {
      try {
        // 加载背景图片
        const bgImg = await loadImage(backgroundImage);

        // 计算缩放比例，确保图片覆盖整个画布
        const scaleX = canvasWidth / bgImg.width;
        const scaleY = canvasHeight / bgImg.height;
        const scale = Math.max(scaleX, scaleY); // 使用较大的缩放比例以确保覆盖

        const scaledWidth = bgImg.width * scale;
        const scaledHeight = bgImg.height * scale;

        // 居中绘制背景图片
        const x = (canvasWidth - scaledWidth) / 2;
        const y = (canvasHeight - scaledHeight) / 2;

        ctx.drawImage(bgImg, x, y, scaledWidth, scaledHeight);
      } catch (error) {
        console.error('加载背景图片失败，使用默认背景:', error);
        // 如果加载失败，使用默认背景
        drawDefaultBackground(ctx, canvasWidth, canvasHeight);
      }
    } else {
      // 使用默认渐变背景
      drawDefaultBackground(ctx, canvasWidth, canvasHeight);
    }


    // 设置文字样式
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (type === 'cover') {
      // 封面专用字体体系（参照图片风格）
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      // 1. 封面主标题（最大元素，参照图片）
      // 位置：顶部约 18% 区域，标题往下压
      const titleStartY = HEIGHT * 0.18; // 约 298px，标题往下压
      const titleFontSize = 130; // 主标题字号
      const titleLineHeight = titleFontSize * 1.4; // 行距 1.4，增加行距让两行更舒适
      const titleColor = '#2f251f'; // 深咖啡色
      const titleMaxWidth = WIDTH - 200; // 左侧留 100px 边距，右侧留 100px，参照图片
      const titleLeftMargin = 100; // 左侧边距，参照图片

      ctx.fillStyle = titleColor;
      ctx.font = `700 ${titleFontSize}px "Noto Serif SC", "Georgia", "Times New Roman", serif`; // 字重 700，更粗，优先使用服务器环境可用字体

      // 如果有背景图片，添加文字描边和阴影以确保可读性
      if (backgroundImage) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 4;
      }

      // 主标题强制分成两行
      const titleLines = splitTitleIntoTwoLines(ctx, title, titleMaxWidth);
      for (const line of titleLines) {
        const y = titleStartY + titleLines.indexOf(line) * titleLineHeight;

        if (backgroundImage) {
          // 绘制描边
          ctx.strokeText(line, titleLeftMargin, y);
          // 绘制阴影
          ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;
        }

        ctx.fillText(line, titleLeftMargin, y);

        if (backgroundImage) {
          ctx.shadowBlur = 0;
          ctx.lineWidth = 0;
        }
      }

      // 2. 封面副标题（参照图片）
      // 位置：主标题下方，有较大的垂直间距，创造呼吸感
      const subtitleStartY = titleStartY + titleLines.length * titleLineHeight + 120; // 间距 120px，参照图片中的大间距
      const subtitleFontSize = 60; // 副标题字号
      const subtitleLineHeight = subtitleFontSize * 1.4; // 行距 1.4，更舒适
      const subtitleColor = '#2f251f'; // 深咖啡色
      const subtitleMaxWidth = WIDTH - 200; // 与主标题对齐

      if (subtitle) {
        ctx.fillStyle = subtitleColor;
        ctx.font = `400 ${subtitleFontSize}px "Noto Serif SC", "Georgia", "Times New Roman", serif`; // 字重 400，常规，优先使用服务器环境可用字体

        if (backgroundImage) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 3;
        }

        // 副标题只显示一行，如果超长则截断
        const subtitleLines = wrapText(ctx, subtitle, subtitleMaxWidth, subtitleLineHeight).slice(0, 1);
        for (const line of subtitleLines) {
          const y = subtitleStartY + subtitleLines.indexOf(line) * subtitleLineHeight;

          if (backgroundImage) {
            ctx.strokeText(line, titleLeftMargin, y);
            ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
          }

          ctx.fillText(line, titleLeftMargin, y);

          if (backgroundImage) {
            ctx.shadowBlur = 0;
            ctx.lineWidth = 0;
          }
        }
      }

      // 3. 水印：蔡蔡｜INFJ成长记录（底部中间）
      const watermarkText = '蔡蔡｜INFJ成长记录';
      const watermarkFontSize = 40;
      const watermarkColor = '#7a695b'; // 比副标题淡一点的咖啡色
      const watermarkY = HEIGHT - 120; // 距离底部120px

      ctx.fillStyle = watermarkColor;
      ctx.font = `400 ${watermarkFontSize}px "Iowan Old Style", "Palatino", "Georgia", "Noto Serif SC", serif`;
      ctx.textAlign = 'center'; // 居中对齐
      ctx.textBaseline = 'middle';

      ctx.fillText(watermarkText, WIDTH / 2, watermarkY);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    } else if (type === 'wechat-cover') {
      // -----------------------------------------------------------------------
      // 公众号封面模式 (2.35:1)
      // -----------------------------------------------------------------------
      const canvasWidth = 2350;
      const canvasHeight = 1000;

      ctx.textBaseline = 'top';

      // 1. 主标题（居中，两行，中上部）
      const titleFontSize = 100;
      const titleLineHeight = titleFontSize * 1.6; // 更松的行距
      const titleColor = '#5a4d42'; // 深咖啡偏深灰色（更浅）
      const titleMaxWidth = canvasWidth - 300; // 左右各留 150

      // 垂直位置：中上部
      const titleStartY = canvasHeight * 0.25; // 距顶部约 250px（中上部）

      ctx.fillStyle = titleColor;
      ctx.font = `400 ${titleFontSize}px "Noto Serif SC", "Georgia", "Times New Roman", serif`; // 字重 400 (regular)
      ctx.textAlign = 'center'; // 居中对齐

      // 背景图增强模式
      if (backgroundImage) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 5;
      }

      // 限制标题最多2行
      const titleLines = wrapText(ctx, title, titleMaxWidth, titleLineHeight).slice(0, 2);
      const titleCenterX = canvasWidth / 2;
      
      // 计算主标题第一行的左边缘位置（用于副标题对齐）
      let titleFirstLineLeftEdge = 0;
      
      // 绘制标题，支持字间距（手动调整字符位置，增加3%间距）
      for (let lineIndex = 0; lineIndex < titleLines.length; lineIndex++) {
        const line = titleLines[lineIndex];
        const y = titleStartY + lineIndex * titleLineHeight;

        // 计算字间距（每个字符后增加约3%的间距）
        const letterSpacing = titleFontSize * 0.03;
        const chars = line.split('');
        
        // 计算整行文本的总宽度（包括字间距）
        let totalWidth = 0;
        for (let i = 0; i < chars.length; i++) {
          totalWidth += ctx.measureText(chars[i]).width;
          if (i < chars.length - 1) {
            totalWidth += letterSpacing;
          }
        }
        
        // 计算每个字符的位置（居中对齐，考虑字间距）
        const charPositions: number[] = [];
        let currentX = titleCenterX - totalWidth / 2;
        
        // 保存第一行的左边缘位置
        if (lineIndex === 0) {
          titleFirstLineLeftEdge = currentX;
        }
        
        for (let i = 0; i < chars.length; i++) {
          charPositions.push(currentX);
          const charWidth = ctx.measureText(chars[i]).width;
          currentX += charWidth + letterSpacing;
        }

        // 如果有背景图，先绘制描边和阴影
        if (backgroundImage) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;
          
          for (let i = 0; i < chars.length; i++) {
            ctx.strokeText(chars[i], charPositions[i], y);
          }
          
          ctx.shadowBlur = 0;
        }

        // 绘制填充文字
        for (let i = 0; i < chars.length; i++) {
          ctx.fillText(chars[i], charPositions[i], y);
        }

        if (backgroundImage) {
          ctx.lineWidth = 0;
        }
      }

      // 2. 副标题（居中）
      if (subtitle) {
        const subtitleStartY = titleStartY + titleLines.length * titleLineHeight + 60; // 间距 60
        const subtitleFontSize = 100; // 与主标题相同
        const subtitleLineHeight = subtitleFontSize * 1.6; // 与主标题相同的行距
        const subtitleColor = '#5a4d42'; // 深咖啡偏深灰色（与主标题相同）

        ctx.fillStyle = subtitleColor;
        ctx.font = `400 ${subtitleFontSize}px "Noto Serif SC", "Georgia", "Times New Roman", serif`;
        ctx.textAlign = 'center'; // 居中对齐

        if (backgroundImage) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 4;
        }

        const subtitleLines = wrapText(ctx, subtitle, titleMaxWidth, subtitleLineHeight);
        const subtitleCenterX = canvasWidth / 2;
        
        // 绘制副标题，支持字间距，居中对齐
        for (let lineIndex = 0; lineIndex < subtitleLines.length; lineIndex++) {
          const line = subtitleLines[lineIndex];
          const y = subtitleStartY + lineIndex * subtitleLineHeight;

          // 计算字间距（每个字符后增加约3%的间距）
          const letterSpacing = subtitleFontSize * 0.03;
          const chars = line.split('');
          
          // 计算整行文本的总宽度（包括字间距）
          let totalWidth = 0;
          for (let i = 0; i < chars.length; i++) {
            totalWidth += ctx.measureText(chars[i]).width;
            if (i < chars.length - 1) {
              totalWidth += letterSpacing;
            }
          }
          
          // 计算每个字符的位置（居中对齐，考虑字间距）
          const charPositions: number[] = [];
          let currentX = subtitleCenterX - totalWidth / 2;
          for (let i = 0; i < chars.length; i++) {
            charPositions.push(currentX);
            const charWidth = ctx.measureText(chars[i]).width;
            currentX += charWidth + letterSpacing;
          }

          // 如果有背景图，先绘制描边和阴影
          if (backgroundImage) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
            
            for (let i = 0; i < chars.length; i++) {
              ctx.strokeText(chars[i], charPositions[i], y);
            }
            
            ctx.shadowBlur = 0;
          }

          // 绘制填充文字
          for (let i = 0; i < chars.length; i++) {
            ctx.fillText(chars[i], charPositions[i], y);
          }

          if (backgroundImage) {
            ctx.lineWidth = 0;
          }
        }
      }

      // 3. 水印
      const watermarkText = '蔡蔡｜INFJ成长记录';
      const watermarkFontSize = 50;
      const watermarkColor = '#7a695b';
      const watermarkY = canvasHeight - 80;

      ctx.fillStyle = watermarkColor;
      ctx.font = `400 ${watermarkFontSize}px "Iowan Old Style", "Palatino", "Georgia", "Noto Serif SC", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillText(watermarkText, canvasWidth / 2, watermarkY);

      // Reset alignment
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    } else {
      // 内页样式：精致排版
      // 如果没有背景图片，使用纯色背景 #F6F1E8
      if (!backgroundImage) {
        ctx.fillStyle = '#F6F1E8';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }

      // 文本垂直起始位置：30%
      let currentY = Math.round(HEIGHT * 0.30); // 30% 位置，约 497px
      ctx.textAlign = 'center'; // 居中对齐
      ctx.textBaseline = 'top';

      // 内页字体体系定义
      // 主标题：较大、加粗
      const titleConfig = {
        fontSize: 64,
        fontWeight: 700,
        color: '#5F5F5F',
        lineHeight: 64 * 1.7,
        bottomSpacing: 40,
      };

      // 副标题：中等大小、常规字重
      const subtitleConfig = {
        fontSize: 48,
        fontWeight: 400,
        color: '#5F5F5F',
        lineHeight: 48 * 1.7,
        bottomSpacing: 50,
      };

      // 正文：Source Han Serif SC, 44px, 行高 1.7, 颜色 #5F5F5F
      const bodyConfig = {
        fontSize: 44,
        fontWeight: 400,
        color: '#5F5F5F',
        lineHeight: 44 * 1.7, // 行高 1.7
        paragraphSpacing: 32, // 段落间距
        bottomSpacing: 32, // 添加 bottomSpacing 属性
      };

      // H1 标题（内容中的一级标题）
      const h1Config = {
        fontSize: 56,
        fontWeight: 600,
        color: '#5F5F5F',
        lineHeight: 56 * 1.7,
        bottomSpacing: 36,
        paragraphSpacing: 32,
      };

      // H2 标题（内容中的二级标题）
      const h2Config = {
        fontSize: 48,
        fontWeight: 500,
        color: '#5F5F5F',
        lineHeight: 48 * 1.7,
        bottomSpacing: 28,
        paragraphSpacing: 32,
      };

      // 先绘制主标题（title）
      if (title && title.trim()) {
        ctx.fillStyle = titleConfig.color;
        ctx.font = `${titleConfig.fontWeight} ${titleConfig.fontSize}px "Source Han Serif SC", "Noto Serif SC", "Georgia", serif`;

        const titleLines = wrapText(ctx, title, WIDTH - 120, titleConfig.lineHeight);
        for (let lineIndex = 0; lineIndex < titleLines.length; lineIndex++) {
          const line = titleLines[lineIndex];
          if (backgroundImage) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 4;
            ctx.strokeText(line, WIDTH / 2, currentY);
            ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;
          }
          ctx.fillText(line, WIDTH / 2, currentY);
          if (backgroundImage) {
            ctx.shadowBlur = 0;
            ctx.lineWidth = 0;
          }
          currentY += titleConfig.lineHeight;
        }
        currentY += titleConfig.bottomSpacing;
      }

      // 再绘制副标题（subtitle）
      if (subtitle && subtitle.trim()) {
        ctx.fillStyle = subtitleConfig.color;
        ctx.font = `${subtitleConfig.fontWeight} ${subtitleConfig.fontSize}px "Source Han Serif SC", "Noto Serif SC", "Georgia", serif`;

        const subtitleLines = wrapText(ctx, subtitle, WIDTH - 120, subtitleConfig.lineHeight);
        for (let lineIndex = 0; lineIndex < subtitleLines.length; lineIndex++) {
          const line = subtitleLines[lineIndex];
          if (backgroundImage) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 3;
            ctx.strokeText(line, WIDTH / 2, currentY);
            ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
          }
          ctx.fillText(line, WIDTH / 2, currentY);
          if (backgroundImage) {
            ctx.shadowBlur = 0;
            ctx.lineWidth = 0;
          }
          currentY += subtitleConfig.lineHeight;
        }
        currentY += subtitleConfig.bottomSpacing;
      }

      // 按段落分割（过滤空行，与前端逻辑保持一致）
      const paragraphs = content.split('\n').filter((p: string) => p.trim() !== '');

      // 按位置排序图片
      const sortedImages = [...images].sort((a, b) => a.position - b.position);

      // 绘制段落和插入图片（使用 for...of 以支持 await）
      let imageIndex = 0;
      let paragraphCount = 0; // 用于图片位置计算

      for (const paragraph of paragraphs) {
        const trimmed = paragraph.trim();

        // Insert images at position 0 (after title/subtitle, before first content paragraph)
        while (imageIndex < sortedImages.length && sortedImages[imageIndex].position === 0) {
          const imageData = sortedImages[imageIndex];
          try {
            const img = await loadImage(imageData.data);
            const maxWidth = WIDTH - 240;
            const maxHeight = 400;
            let imgWidth = img.width;
            let imgHeight = img.height;

            if (imgWidth > maxWidth) {
              const ratio = maxWidth / imgWidth;
              imgWidth = maxWidth;
              imgHeight = imgHeight * ratio;
            }

            if (imgHeight > maxHeight) {
              const ratio = maxHeight / imgHeight;
              imgHeight = maxHeight;
              imgWidth = imgWidth * ratio;
            }

            const imgX = (WIDTH - imgWidth) / 2;
            currentY += 30;

            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 4;

            const radius = 12;
            ctx.fillStyle = 'white';
            drawRoundedRect(ctx, imgX - 10, currentY - 10, imgWidth + 20, imgHeight + 20, radius);
            ctx.fill();

            ctx.drawImage(img, imgX, currentY, imgWidth, imgHeight);
            ctx.restore();

            currentY += imgHeight + 40;
          } catch (error) {
            console.error('加载图片失败:', error);
          }
          imageIndex++;
        }

        if (trimmed === '') {
          currentY += bodyConfig.paragraphSpacing;
        } else {
          let textToDraw = trimmed;
          let config = bodyConfig;
          let isTitle = false;

          if (trimmed.startsWith('# ')) {
            textToDraw = trimmed.substring(2);
            config = h1Config;
            isTitle = true;
          } else if (trimmed.startsWith('## ')) {
            textToDraw = trimmed.substring(3);
            config = h2Config;
            isTitle = true;
          }

          ctx.fillStyle = config.color;
          ctx.font = `${config.fontWeight} ${config.fontSize}px "Source Han Serif SC", "Noto Serif SC", "Georgia", serif`;

          const lines = wrapText(ctx, textToDraw, WIDTH - 120, config.lineHeight);
          for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            if (currentY > HEIGHT - 150) {
              break;
            }

            if (backgroundImage) { // Apply stroke and shadow for readability on background image
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
              ctx.lineWidth = 3;
              ctx.strokeText(line, WIDTH / 2, currentY);
              ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
              ctx.shadowBlur = 4;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 1;
            }

            ctx.fillText(line, WIDTH / 2, currentY);

            if (backgroundImage) {
              ctx.shadowBlur = 0;
              ctx.lineWidth = 0;
            }
            currentY += config.lineHeight;
          }
          currentY += config.bottomSpacing || bodyConfig.paragraphSpacing; // Use specific bottom spacing or default
          paragraphCount++;

          // Insert images after this paragraph
          while (imageIndex < sortedImages.length && sortedImages[imageIndex].position === paragraphCount) {
            const imageData = sortedImages[imageIndex];
            try {
              const img = await loadImage(imageData.data);
              const maxWidth = WIDTH - 240;
              const maxHeight = 400;
              let imgWidth = img.width;
              let imgHeight = img.height;

              if (imgWidth > maxWidth) {
                const ratio = maxWidth / imgWidth;
                imgWidth = maxWidth;
                imgHeight = imgHeight * ratio;
              }

              if (imgHeight > maxHeight) {
                const ratio = maxHeight / imgHeight;
                imgHeight = maxHeight;
                imgWidth = imgWidth * ratio;
              }

              const imgX = (WIDTH - imgWidth) / 2;
              currentY += 30;

              ctx.save();
              ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
              ctx.shadowBlur = 8;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 4;

              const radius = 12;
              ctx.fillStyle = 'white';
              drawRoundedRect(ctx, imgX - 10, currentY - 10, imgWidth + 20, imgHeight + 20, radius);
              ctx.fill();

              ctx.drawImage(img, imgX, currentY, imgWidth, imgHeight);
              ctx.restore();

              currentY += imgHeight + 40;
            } catch (error) {
              console.error('加载图片失败:', error);
            }
            imageIndex++;
          }
        }
      }

      // Handle images positioned at the end
      const maxPosition = paragraphs.filter((p: string) => p.trim() !== '').length + 1;
      while (imageIndex < sortedImages.length && sortedImages[imageIndex].position >= maxPosition) {
        const imageData = sortedImages[imageIndex];
        try {
          const img = await loadImage(imageData.data);
          const maxWidth = WIDTH - 240;
          const maxHeight = 400;
          let imgWidth = img.width;
          let imgHeight = img.height;

          if (imgWidth > maxWidth) {
            const ratio = maxWidth / imgWidth;
            imgWidth = maxWidth;
            imgHeight = imgHeight * ratio;
          }

          if (imgHeight > maxHeight) {
            const ratio = maxHeight / imgHeight;
            imgHeight = maxHeight;
            imgWidth = imgWidth * ratio;
          }

          const imgX = (WIDTH - imgWidth) / 2;
          currentY += 30;

          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 4;

          const radius = 12;
          ctx.fillStyle = 'white';
          drawRoundedRect(ctx, imgX - 10, currentY - 10, imgWidth + 20, imgHeight + 20, radius);
          ctx.fill();

          ctx.drawImage(img, imgX, currentY, imgWidth, imgHeight);
          ctx.restore();

          currentY += imgHeight + 40;
        } catch (error) {
          console.error('加载图片失败:', error);
        }
        imageIndex++;
      }

      // 内页水印：蔡蔡｜INFJ成长记录（底部中间）
      const watermarkText = '蔡蔡｜INFJ成长记录';
      const watermarkFontSize = 28;
      const watermarkColor = 'rgba(138, 138, 138, 0.7)'; // #8A8A8A with 0.7 opacity
      const watermarkY = HEIGHT - 100; // 距离底部100px

      ctx.fillStyle = watermarkColor;
      ctx.font = `400 ${watermarkFontSize}px "Source Han Serif SC", "Noto Serif SC", "Georgia", serif`;
      ctx.textAlign = 'center'; // 居中对齐
      ctx.textBaseline = 'middle';

      ctx.fillText(watermarkText, WIDTH / 2, watermarkY);
    }

    // 转换为 Buffer
    const buffer = canvas.toBuffer('image/png');

    // 返回图片
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="xiaohongshu-${type}.png"`,
      },
    });
  } catch (error) {
    console.error('生成图片失败:', error);
    return NextResponse.json(
      { error: '生成图片失败' },
      { status: 500 }
    );
  }
}
