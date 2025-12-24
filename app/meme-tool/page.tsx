'use client';

import React, { useState, useEffect } from 'react';

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

async function segmentImage(file: File): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BACKEND_BASE_URL}/api/segment`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`分割失败：${res.status}`);
  }

  return await res.blob();
}

async function resizeToSquare512(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const size = 512;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 不可用');

  ctx.clearRect(0, 0, size, size);

  const scale = Math.min(size / bitmap.width, size / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  const dx = (size - drawWidth) / 2;
  const dy = (size - drawHeight) / 2;

  ctx.drawImage(bitmap, dx, dy, drawWidth, drawHeight);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('导出失败'))),
      'image/png',
    ),
  );
}

async function splitNineGrid(blob512: Blob): Promise<Blob[]> {
  const bitmap = await createImageBitmap(blob512);
  const size = 512;
  const cell = Math.floor(size / 3);

  const blobs: Blob[] = [];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const canvas = document.createElement('canvas');
      canvas.width = cell;
      canvas.height = cell;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 不可用');

      const sx = col * cell;
      const sy = row * cell;

      ctx.drawImage(bitmap, sx, sy, cell, cell, 0, 0, cell, cell);

      // eslint-disable-next-line no-await-in-loop
      const b = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (bb) => (bb ? resolve(bb) : reject(new Error('导出失败'))),
          'image/png',
        ),
      );
      blobs.push(b);
    }
  }

  return blobs;
}

// 通用网格分割函数：将图片分割成 rows x cols 的网格
async function splitGrid(blob: Blob, rows: number, cols: number): Promise<Blob[]> {
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width;
  const height = bitmap.height;
  
  // 计算每个单元格的精确尺寸（保持精度）
  const exactCellWidth = width / cols;
  const exactCellHeight = height / rows;
  
  // 计算标准单元格尺寸（向下取整，作为基准）
  const baseCellWidth = Math.floor(exactCellWidth);
  const baseCellHeight = Math.floor(exactCellHeight);
  
  // 计算总误差（由于取整产生的像素差）
  const widthRemainder = width - (baseCellWidth * cols);
  const heightRemainder = height - (baseCellHeight * rows);

  const blobs: Blob[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // 计算精确的起始位置（使用精确的浮点数计算）
      const exactSx = col * exactCellWidth;
      const exactSy = row * exactCellHeight;
      const exactEx = (col + 1) * exactCellWidth;
      const exactEy = (row + 1) * exactCellHeight;
      
      // 转换为整数坐标（四舍五入以保持最佳精度）
      const sx = Math.round(exactSx);
      const sy = Math.round(exactSy);
      
      // 对于最后一列/行，使用精确的结束位置；否则使用计算出的下一个起始位置
      const ex = col === cols - 1 ? width : Math.round(exactEx);
      const ey = row === rows - 1 ? height : Math.round(exactEy);
      
      // 计算实际的单元格尺寸
      const cellWidth = ex - sx;
      const cellHeight = ey - sy;
      
      // 创建canvas，尺寸与源单元格完全一致
      const canvas = document.createElement('canvas');
      canvas.width = cellWidth;
      canvas.height = cellHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 不可用');

      // 直接绘制：从源图片精确位置提取对应区域
      // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
      ctx.drawImage(
        bitmap,
        sx,              // 源x坐标
        sy,              // 源y坐标
        cellWidth,       // 源宽度
        cellHeight,      // 源高度
        0,               // 目标x坐标
        0,               // 目标y坐标
        cellWidth,       // 目标宽度（与源相同）
        cellHeight       // 目标高度（与源相同）
      );

      // eslint-disable-next-line no-await-in-loop
      const b = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (bb) => (bb ? resolve(bb) : reject(new Error('导出失败'))),
          'image/png',
        ),
      );
      blobs.push(b);
    }
  }

  return blobs;
}

interface ImageItem {
  file: File;
  previewUrl: string;
  segmentedUrl: string | null;
  id: string;
}

export default function MemeToolPage() {
  const [files, setFiles] = useState<ImageItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [processingIndex, setProcessingIndex] = useState<number | null>(null);
  const [gridRows, setGridRows] = useState(4);
  const [gridCols, setGridCols] = useState(4);

  // 设置页面标题
  useEffect(() => {
    document.title = '蔡蔡小宇宙-照片分割器';
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    
    const newFiles: ImageItem[] = Array.from(fileList).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      segmentedUrl: null,
      id: Date.now().toString() + Math.random().toString(),
    }));
    
    setFiles(newFiles);
    setSelectedIndex(null);
  };

  const handleSegment = async (index?: number) => {
    // 如果指定了索引，只处理单张；否则批量处理所有
    const indices = index !== undefined ? [index] : files.map((_, i) => i);
    
    if (indices.length === 0) return;
    
    setLoading(true);
    
    try {
      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        const item = files[idx];
        if (!item) continue;
        
        setProcessingIndex(idx);
        
        try {
          const blob = await segmentImage(item.file);
          const url = URL.createObjectURL(blob);
          
          setFiles((prev) =>
            prev.map((f, j) =>
              j === idx ? { ...f, segmentedUrl: url } : f
            )
          );
        } catch (e: any) {
          console.error(`处理第 ${idx + 1} 张图片失败:`, e);
          alert(`处理 ${item.file.name} 失败：${e?.message || '未知错误'}`);
        }
      }
      
      if (indices.length > 1) {
        alert(`成功处理 ${indices.length} 张图片！`);
      }
    } finally {
      setLoading(false);
      setProcessingIndex(null);
    }
  };

  const handleExport512 = async (index?: number) => {
    const items = index !== undefined ? [files[index]] : files.filter(f => f.segmentedUrl);
    if (items.length === 0) return;
    
    for (const item of items) {
      if (!item.segmentedUrl) continue;
      const res = await fetch(item.segmentedUrl);
      const blob = await res.blob();
      const resized = await resizeToSquare512(blob);

      const url = URL.createObjectURL(resized);
      const a = document.createElement('a');
      a.href = url;
      const baseName = item.file.name.replace(/\.[^/.]+$/, '');
      a.download = `${baseName}-512.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleExportNine = async (index?: number) => {
    const items = index !== undefined ? [files[index]] : files.filter(f => f.segmentedUrl);
    if (items.length === 0) return;
    
    for (const item of items) {
      if (!item.segmentedUrl) continue;
      const res = await fetch(item.segmentedUrl);
      const blob = await res.blob();
      const resized = await resizeToSquare512(blob);
      const nine = await splitNineGrid(resized);

      const baseName = item.file.name.replace(/\.[^/.]+$/, '');
      nine.forEach((b, idx) => {
        const url = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}-9grid-${idx + 1}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }
  };

  const removeFile = (index: number) => {
    const item = files[index];
    URL.revokeObjectURL(item.previewUrl);
    if (item.segmentedUrl) {
      URL.revokeObjectURL(item.segmentedUrl);
    }
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (selectedIndex === index) {
      setSelectedIndex(null);
    } else if (selectedIndex !== null && selectedIndex > index) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  return (
    <div className="meme-app-container">
      <div className="meme-tool-card">
        <header style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '0.3rem 0.9rem',
              borderRadius: '999px',
              border: '1px solid var(--color-border)',
              background: 'rgba(255, 253, 248, 0.85)',
              fontSize: '0.8rem',
              color: 'var(--color-text-muted)',
              marginBottom: '0.75rem',
            }}
          >
            蔡蔡小宇宙
          </div>
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 650,
              marginBottom: '0.5rem',
              color: 'var(--color-text-primary)',
            }}
          >
            照片分割器
          </h1>
          <p className="meme-step-desc">
            支持两种模式：1) 批量处理多张图片进行抠图；2) 将一张包含多张小图的拼图分割成独立图片。
          </p>
        </header>

        {/* Step 1: 上传 */}
        <section style={{ marginBottom: '1.5rem' }}>
          <div className="meme-step-title">1. 上传图片</div>
          <p className="meme-step-desc">支持 JPG / PNG。可以：1) 选择多张图片进行批量处理；2) 选择一张包含多张小图的拼图进行网格分割。</p>

          <input
            id="meme-upload-input"
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <label htmlFor="meme-upload-input" className="meme-upload-dropzone">
            {files.length > 0 
              ? `已选择 ${files.length} 张图片（点击可重新选择）` 
              : '拖拽图片到这里，或点击选择文件（可多选）'}
          </label>

          {files.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div className="meme-step-desc">
                已选择 {files.length} 张图片 {processingIndex !== null && `（正在处理第 ${processingIndex + 1} 张...）`}
              </div>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: '0.75rem',
                marginTop: '0.5rem'
              }}>
                {files.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      position: 'relative',
                      border: selectedIndex === index ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                      borderRadius: 10,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      background: processingIndex === index ? 'rgba(0, 123, 255, 0.1)' : '#fff',
                    }}
                    onClick={() => setSelectedIndex(index)}
                  >
                    <img
                      src={item.previewUrl}
                      alt={`预览 ${index + 1}`}
                      style={{
                        width: '100%',
                        height: '120px',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                    {item.segmentedUrl && (
                      <div style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: 'rgba(0, 200, 0, 0.8)',
                        color: 'white',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                      }}>
                        ✓
                      </div>
                    )}
                    {processingIndex === index && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '12px',
                      }}>
                        处理中...
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        left: '4px',
                        background: 'rgba(255, 0, 0, 0.8)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      ×
                    </button>
                    <div style={{
                      padding: '4px',
                      fontSize: '10px',
                      background: 'rgba(0, 0, 0, 0.7)',
                      color: 'white',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.file.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedIndex !== null && files[selectedIndex] && (
            <div style={{ marginTop: '1rem' }}>
              <div className="meme-step-desc">选中图片预览：</div>
              <img
                src={files[selectedIndex].previewUrl}
                alt="原图预览"
                style={{
                  maxWidth: '100%',
                  borderRadius: 14,
                  border: '1px solid var(--color-border)',
                  background: '#fff',
                }}
              />
            </div>
          )}
        </section>

        {/* Step 2: 智能抠图 */}
        <section style={{ marginBottom: '1.5rem' }}>
          <div className="meme-step-title">2. 智能抠图</div>
          <p className="meme-step-desc">
            后端会根据背景颜色自动抠出前景主体，适合纯色或近纯色背景的照片。支持批量处理所有图片！
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className="meme-btn-primary"
              onClick={() => handleSegment()}
              disabled={files.length === 0 || loading}
            >
              {loading ? `处理中… (${processingIndex !== null ? processingIndex + 1 : 0}/${files.length})` : `批量处理所有图片 (${files.length} 张)`}
            </button>
            {selectedIndex !== null && (
              <button
                className="meme-btn-secondary"
                onClick={() => handleSegment(selectedIndex)}
                disabled={loading}
              >
                {loading && processingIndex === selectedIndex ? '处理中…' : '处理当前选中'}
              </button>
            )}
          </div>

          {selectedIndex !== null && files[selectedIndex]?.segmentedUrl && (
            <div style={{ marginTop: '1rem' }}>
              <div className="meme-step-desc">当前选中图片的抠图结果（背景已透明）：</div>
              <img
                src={files[selectedIndex].segmentedUrl}
                alt="抠图结果"
                style={{
                  maxWidth: '100%',
                  borderRadius: 14,
                  border: '1px solid var(--color-border)',
                  background: '#fff',
                }}
              />
            </div>
          )}
        </section>

        {/* Step 2.5: 网格分割（将一张图分割成多张） */}
        <section style={{ marginBottom: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
          <div className="meme-step-title">图片网格分割</div>
          <p className="meme-step-desc">
            将一张包含多张小图的拼图分割成独立图片。例如：将包含 16 张照片的 4×4 网格图片分割成 16 张独立图片。
          </p>
          
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginRight: '0.5rem' }}>
                  行数：
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={gridRows}
                  onChange={(e) => setGridRows(parseInt(e.target.value) || 1)}
                  style={{
                    width: '60px',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    fontSize: '1rem',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginRight: '0.5rem' }}>
                  列数：
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={gridCols}
                  onChange={(e) => setGridCols(parseInt(e.target.value) || 1)}
                  style={{
                    width: '60px',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    fontSize: '1rem',
                  }}
                />
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                共 {gridRows * gridCols} 张图片
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => { setGridRows(2); setGridCols(2); }}
                style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: gridRows === 2 && gridCols === 2 ? 'var(--color-accent)' : 'transparent', color: gridRows === 2 && gridCols === 2 ? 'white' : 'var(--color-text-primary)', cursor: 'pointer' }}
              >
                2×2 (4张)
              </button>
              <button
                onClick={() => { setGridRows(2); setGridCols(3); }}
                style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: gridRows === 2 && gridCols === 3 ? 'var(--color-accent)' : 'transparent', color: gridRows === 2 && gridCols === 3 ? 'white' : 'var(--color-text-primary)', cursor: 'pointer' }}
              >
                2×3 (6张)
              </button>
              <button
                onClick={() => { setGridRows(3); setGridCols(2); }}
                style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: gridRows === 3 && gridCols === 2 ? 'var(--color-accent)' : 'transparent', color: gridRows === 3 && gridCols === 2 ? 'white' : 'var(--color-text-primary)', cursor: 'pointer' }}
              >
                3×2 (6张)
              </button>
              <button
                onClick={() => { setGridRows(3); setGridCols(3); }}
                style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: gridRows === 3 && gridCols === 3 ? 'var(--color-accent)' : 'transparent', color: gridRows === 3 && gridCols === 3 ? 'white' : 'var(--color-text-primary)', cursor: 'pointer' }}
              >
                3×3 (9张)
              </button>
              <button
                onClick={() => { setGridRows(3); setGridCols(5); }}
                style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: gridRows === 3 && gridCols === 5 ? 'var(--color-accent)' : 'transparent', color: gridRows === 3 && gridCols === 5 ? 'white' : 'var(--color-text-primary)', cursor: 'pointer' }}
              >
                3×5 (15张)
              </button>
              <button
                onClick={() => { setGridRows(5); setGridCols(3); }}
                style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: gridRows === 5 && gridCols === 3 ? 'var(--color-accent)' : 'transparent', color: gridRows === 5 && gridCols === 3 ? 'white' : 'var(--color-text-primary)', cursor: 'pointer' }}
              >
                5×3 (15张)
              </button>
              <button
                onClick={() => { setGridRows(4); setGridCols(4); }}
                style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: gridRows === 4 && gridCols === 4 ? 'var(--color-accent)' : 'transparent', color: gridRows === 4 && gridCols === 4 ? 'white' : 'var(--color-text-primary)', cursor: 'pointer' }}
              >
                4×4 (16张)
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input
              id="grid-split-upload"
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setLoading(true);
                try {
                  const blob = await new Promise<Blob>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                      const img = new Image();
                      img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) throw new Error('Canvas 不可用');
                        ctx.drawImage(img, 0, 0);
                        canvas.toBlob((b) => {
                          if (b) resolve(b);
                          else throw new Error('图片转换失败');
                        }, 'image/png');
                      };
                      img.src = reader.result as string;
                    };
                    reader.readAsDataURL(file);
                  });

                  const splitImages = await splitGrid(blob, gridRows, gridCols);
                  const baseName = file.name.replace(/\.[^/.]+$/, '');
                  
                  console.log(`分割完成，共 ${splitImages.length} 张图片，开始下载...`);
                  
                  // 使用更长的延迟以确保浏览器不会阻止多个下载
                  for (let idx = 0; idx < splitImages.length; idx++) {
                    const b = splitImages[idx];
                    const url = URL.createObjectURL(b);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${baseName}-${String(Math.floor(idx / gridCols) + 1).padStart(2, '0')}-${String((idx % gridCols) + 1).padStart(2, '0')}.png`;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    
                    // 立即触发点击
                    a.click();
                    
                    // 延迟移除元素和释放 URL，给浏览器时间处理下载
                    setTimeout(() => {
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }, 200);
                    
                    // 在下载之间添加延迟，避免浏览器阻止多个下载
                    // 浏览器通常允许短时间内多个下载，但需要间隔
                    if (idx < splitImages.length - 1) {
                      await new Promise(resolve => setTimeout(resolve, 300));
                    }
                    
                    console.log(`已触发下载第 ${idx + 1}/${splitImages.length} 张`);
                  }
                  
                  // 等待所有下载完成
                  await new Promise(resolve => setTimeout(resolve, 500));
                  alert(`成功分割成 ${splitImages.length} 张图片！所有图片已开始下载，请检查浏览器下载文件夹。\n\n注意：某些浏览器可能会询问是否允许多个下载，请点击"允许"。`);
                } catch (e: any) {
                  alert(`分割失败：${e?.message || '未知错误'}`);
                } finally {
                  setLoading(false);
                  // 清空文件选择，以便可以再次选择同一文件
                  e.target.value = '';
                }
              }}
            />
            <label htmlFor="grid-split-upload" className="meme-btn-primary" style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? '分割中…' : `上传并分割为 ${gridRows}×${gridCols} 网格`}
            </label>
            
            {selectedIndex !== null && files[selectedIndex] && (
              <button
                className="meme-btn-secondary"
                onClick={async () => {
                  const selectedFile = files[selectedIndex].file;
                  setLoading(true);
                  try {
                    const blob = await new Promise<Blob>((resolve) => {
                      const reader = new FileReader();
                      reader.onload = () => {
                        const img = new Image();
                        img.onload = () => {
                          const canvas = document.createElement('canvas');
                          canvas.width = img.width;
                          canvas.height = img.height;
                          const ctx = canvas.getContext('2d');
                          if (!ctx) throw new Error('Canvas 不可用');
                          ctx.drawImage(img, 0, 0);
                          canvas.toBlob((b) => {
                            if (b) resolve(b);
                            else throw new Error('图片转换失败');
                          }, 'image/png');
                        };
                        img.src = reader.result as string;
                      };
                      reader.readAsDataURL(selectedFile);
                    });

                    const splitImages = await splitGrid(blob, gridRows, gridCols);
                    const baseName = selectedFile.name.replace(/\.[^/.]+$/, '');
                    
                    console.log(`分割完成，共 ${splitImages.length} 张图片，开始下载...`);
                    
                    // 使用更长的延迟以确保浏览器不会阻止多个下载
                    for (let idx = 0; idx < splitImages.length; idx++) {
                      const b = splitImages[idx];
                      const url = URL.createObjectURL(b);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${baseName}-${String(Math.floor(idx / gridCols) + 1).padStart(2, '0')}-${String((idx % gridCols) + 1).padStart(2, '0')}.png`;
                      a.style.display = 'none';
                      document.body.appendChild(a);
                      
                      // 立即触发点击
                      a.click();
                      
                      // 延迟移除元素和释放 URL，给浏览器时间处理下载
                      setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }, 200);
                      
                      // 在下载之间添加延迟，避免浏览器阻止多个下载
                      if (idx < splitImages.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                      }
                      
                      console.log(`已触发下载第 ${idx + 1}/${splitImages.length} 张`);
                    }
                    
                    // 等待所有下载完成
                    await new Promise(resolve => setTimeout(resolve, 500));
                    alert(`成功分割成 ${splitImages.length} 张图片！所有图片已开始下载，请检查浏览器下载文件夹。\n\n注意：某些浏览器可能会询问是否允许多个下载，请点击"允许"。`);
                  } catch (e: any) {
                    alert(`分割失败：${e?.message || '未知错误'}`);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                {loading ? '分割中…' : '分割当前选中图片'}
              </button>
            )}
          </div>
        </section>

        {/* Step 3: 尺寸预设 + 九宫格导出 */}
        <section>
          <div className="meme-step-title">3. 导出表情包</div>
          <p className="meme-step-desc">
            支持标准 512×512 尺寸和 3×3 九宫格导出（共 9 张）。可批量导出所有已处理的图片！
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <button
              className="meme-btn-primary"
              onClick={() => handleExport512()}
              disabled={files.filter(f => f.segmentedUrl).length === 0}
            >
              批量导出所有 512×512 PNG ({files.filter(f => f.segmentedUrl).length} 张)
            </button>
            <button
              className="meme-btn-secondary"
              onClick={() => handleExportNine()}
              disabled={files.filter(f => f.segmentedUrl).length === 0}
            >
              批量导出所有九宫格 ({files.filter(f => f.segmentedUrl).length * 9} 张)
            </button>
            {selectedIndex !== null && files[selectedIndex]?.segmentedUrl && (
              <>
                <button
                  className="meme-btn-primary"
                  onClick={() => handleExport512(selectedIndex)}
                  style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                >
                  导出当前 512×512
                </button>
                <button
                  className="meme-btn-secondary"
                  onClick={() => handleExportNine(selectedIndex)}
                  style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                >
                  导出当前九宫格
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}




