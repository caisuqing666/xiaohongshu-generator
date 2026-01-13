'use client';

import { useState, useEffect } from 'react';

// 照片分割相关的工具函数
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
  
  const exactCellWidth = width / cols;
  const exactCellHeight = height / rows;

  const blobs: Blob[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const exactSx = col * exactCellWidth;
      const exactSy = row * exactCellHeight;
      const exactEx = (col + 1) * exactCellWidth;
      const exactEy = (row + 1) * exactCellHeight;
      
      const sx = Math.round(exactSx);
      const sy = Math.round(exactSy);
      const ex = col === cols - 1 ? width : Math.round(exactEx);
      const ey = row === rows - 1 ? height : Math.round(exactEy);
      
      const cellWidth = ex - sx;
      const cellHeight = ey - sy;
      
      const canvas = document.createElement('canvas');
      canvas.width = cellWidth;
      canvas.height = cellHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 不可用');

      ctx.drawImage(
        bitmap,
        sx, sy, cellWidth, cellHeight,
        0, 0, cellWidth, cellHeight
      );

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
  id: string;
  file: File;
  preview: string;
  position: number; // 在内容中的位置（段落索引）
}

interface SplitImageItem {
  file: File;
  previewUrl: string;
  segmentedUrl: string | null;
  id: string;
}

export default function XiaohongshuGenerator() {
  const [title, setTitle] = useState('');
  const [titleLine1, setTitleLine1] = useState(''); // 主标题第一行（封面模式）
  const [titleLine2, setTitleLine2] = useState(''); // 主标题第二行（封面模式）
  const [subtitle, setSubtitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<'cover' | 'content' | 'wechat-cover' | 'photo-split'>('cover');
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // 照片分割相关状态
  const [splitFiles, setSplitFiles] = useState<SplitImageItem[]>([]);
  const [selectedSplitIndex, setSelectedSplitIndex] = useState<number | null>(null);
  const [processingSplitIndex, setProcessingSplitIndex] = useState<number | null>(null);
  const [gridRows, setGridRows] = useState(4);
  const [gridCols, setGridCols] = useState(4);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 处理图片上传
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const preview = event.target?.result as string;
          const newImage: ImageItem = {
            id: Date.now().toString() + Math.random(),
            file,
            preview,
            position: 0, // 默认位置
          };
          setImages((prev) => [...prev, newImage]);
        };
        reader.readAsDataURL(file);
      }
    });
  };

  // 删除图片
  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  // 更新图片位置
  const updateImagePosition = (id: string, position: number) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, position } : img))
    );
  };

  // 处理背景图片上传
  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const preview = event.target?.result as string;
        setBackgroundImage(preview);
        setBackgroundFile(file);
      };
      reader.readAsDataURL(file);
    }
  };

  // 清除背景图片
  const clearBackground = () => {
    setBackgroundImage(null);
    setBackgroundFile(null);
  };

  // 照片分割：处理文件上传
  const handleSplitFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    
    const newFiles: SplitImageItem[] = Array.from(fileList).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      segmentedUrl: null,
      id: Date.now().toString() + Math.random().toString(),
    }));
    
    setSplitFiles(newFiles);
    setSelectedSplitIndex(null);
  };

  // 照片分割：智能抠图
  const handleSegment = async (index?: number) => {
    const indices = index !== undefined ? [index] : splitFiles.map((_, i) => i);
    if (indices.length === 0) return;
    
    setLoading(true);
    try {
      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        const item = splitFiles[idx];
        if (!item) continue;
        
        setProcessingSplitIndex(idx);
        try {
          const blob = await segmentImage(item.file);
          const url = URL.createObjectURL(blob);
          setSplitFiles((prev) =>
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
      setProcessingSplitIndex(null);
    }
  };

  // 照片分割：导出 512×512
  const handleExport512 = async (index?: number) => {
    const items = index !== undefined ? [splitFiles[index]] : splitFiles.filter(f => f.segmentedUrl);
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

  // 照片分割：导出九宫格
  const handleExportNine = async (index?: number) => {
    const items = index !== undefined ? [splitFiles[index]] : splitFiles.filter(f => f.segmentedUrl);
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

  // 照片分割：网格分割
  const handleGridSplit = async (file: File) => {
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
      
      for (let idx = 0; idx < splitImages.length; idx++) {
        const b = splitImages[idx];
        const url = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}-${String(Math.floor(idx / gridCols) + 1).padStart(2, '0')}-${String((idx % gridCols) + 1).padStart(2, '0')}.png`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 200);
        if (idx < splitImages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      alert(`成功分割成 ${splitImages.length} 张图片！所有图片已开始下载。`);
    } catch (e: any) {
      alert(`分割失败：${e?.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 照片分割：删除文件
  const removeSplitFile = (index: number) => {
    const item = splitFiles[index];
    URL.revokeObjectURL(item.previewUrl);
    if (item.segmentedUrl) {
      URL.revokeObjectURL(item.segmentedUrl);
    }
    setSplitFiles((prev) => prev.filter((_, i) => i !== index));
    if (selectedSplitIndex === index) {
      setSelectedSplitIndex(null);
    } else if (selectedSplitIndex !== null && selectedSplitIndex > index) {
      setSelectedSplitIndex(selectedSplitIndex - 1);
    }
  };

  // 将图片转换为 base64
  const convertImagesToBase64 = async (): Promise<Array<{ data: string; position: number }>> => {
    const imageData = await Promise.all(
      images.map(async (img) => {
        return new Promise<{ data: string; position: number }>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              data: reader.result as string,
              position: img.position,
            });
          };
          reader.readAsDataURL(img.file);
        });
      })
    );
    return imageData;
  };

  // 将背景图片转换为 base64
  const convertBackgroundToBase64 = async (): Promise<string | null> => {
    if (!backgroundFile) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(backgroundFile);
    });
  };

  const generateImage = async () => {
    // 封面模式：合并两行标题
    let finalTitle = title;
    if (type === 'cover') {
      // 封面模式使用两个输入框的内容
      finalTitle = [titleLine1.trim(), titleLine2.trim()].filter(t => t).join('\n');
      if (!finalTitle.trim()) {
        alert('封面模式需要填写主标题');
        return;
      }
    } else if (type === 'wechat-cover') {
      // 公众号封面模式使用单个标题输入框
      if (!title.trim()) {
        alert('公众号封面模式需要填写标题');
        return;
      }
      finalTitle = title;
    }

    if (type === 'content' && !title.trim() && !content.trim()) {
      alert('内页模式需要填写标题或正文内容');
      return;
    }

    setLoading(true);
    try {
      // 转换图片为 base64
      const imageData = type === 'content' ? await convertImagesToBase64() : [];
      const backgroundData = await convertBackgroundToBase64(); // 封面和内页都支持背景图

      const response = await fetch('/api/generate-xiaohongshu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: finalTitle,
          subtitle,
          content,
          type,
          images: imageData,
          backgroundImage: backgroundData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '未知错误' }));
        throw new Error(errorData.error || `生成图片失败 (${response.status})`);
      }

      const blob = await response.blob();

      // 检查是否是有效的图片
      if (!blob.type.startsWith('image/')) {
        throw new Error('服务器返回的不是图片文件');
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xiaohongshu-${type}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('生成图片失败:', error);
      const errorMessage = error?.message || '生成图片失败，请重试';
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="brand-container" style={{ minHeight: '100vh', padding: isMobile ? '1rem' : '2rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        <h1 style={{
          fontSize: isMobile ? '1.8rem' : '2.5rem',
          fontWeight: 700,
          marginBottom: isMobile ? '1.5rem' : '2rem',
          color: 'var(--color-text-primary)',
          textAlign: 'center'
        }}>
          小红书图片生成器
        </h1>

        <div style={{
          background: 'var(--color-card-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: isMobile ? '15px' : '20px',
          padding: isMobile ? '1.5rem' : '2rem',
          boxShadow: '0 2px 8px var(--color-shadow)',
        }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              color: 'var(--color-text-primary)',
              fontWeight: 600
            }}>
              类型
            </label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => setType('cover')}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '10px',
                  border: `2px solid ${type === 'cover' ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: type === 'cover' ? 'var(--color-accent)' : 'transparent',
                  color: type === 'cover' ? 'white' : 'var(--color-text-primary)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.3s ease',
                }}
              >
                小红书封面 (3:4)
              </button>
              <button
                onClick={() => setType('content')}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '10px',
                  border: `2px solid ${type === 'content' ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: type === 'content' ? 'var(--color-accent)' : 'transparent',
                  color: type === 'content' ? 'white' : 'var(--color-text-primary)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.3s ease',
                }}
              >
                内页 (3:4)
              </button>
              <button
                onClick={() => setType('wechat-cover')}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '10px',
                  border: `2px solid ${type === 'wechat-cover' ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: type === 'wechat-cover' ? 'var(--color-accent)' : 'transparent',
                  color: type === 'wechat-cover' ? 'white' : 'var(--color-text-primary)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.3s ease',
                }}
              >
                公众号封面 (2.35:1)
              </button>
              <button
                onClick={() => setType('photo-split')}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '10px',
                  border: `2px solid ${type === 'photo-split' ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: type === 'photo-split' ? 'var(--color-accent)' : 'transparent',
                  color: type === 'photo-split' ? 'white' : 'var(--color-text-primary)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.3s ease',
                }}
              >
                照片分割
              </button>
            </div>
          </div>

          {/* 非照片分割模式：显示原有表单 */}
          {type !== 'photo-split' && (
            <>
          {/* 背景图片上传（封面和内页都支持） */}
          {(type === 'cover' || type === 'content' || type === 'wechat-cover') && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: 'var(--color-text-primary)',
                fontWeight: 600
              }}>
                背景图片 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(可选，上传后会作为{type === 'wechat-cover' ? '公众号封面' : type === 'cover' ? '封面' : '内页'}背景)</span>
              </label>
              {backgroundImage ? (
                <div style={{
                  position: 'relative',
                  border: '1px solid var(--color-border)',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: 'white',
                }}>
                  <img
                    src={backgroundImage}
                    alt="背景预览"
                    style={{
                      width: '100%',
                      maxHeight: '300px',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                  <button
                    onClick={clearBackground}
                    style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      padding: '0.5rem 1rem',
                      background: 'rgba(0, 0, 0, 0.6)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                    }}
                  >
                    移除
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBackgroundUpload}
                    style={{ display: 'none' }}
                    id="background-upload"
                  />
                  <label
                    htmlFor="background-upload"
                    style={{
                      display: 'block',
                      padding: '1rem',
                      border: '2px dashed var(--color-border)',
                      borderRadius: '10px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      color: 'var(--color-text-secondary)',
                      background: 'rgba(255, 255, 255, 0.5)',
                      transition: 'all 0.3s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-accent)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.5)';
                    }}
                  >
                    🖼️ 点击上传背景图片
                  </label>
                </>
              )}
            </div>
          )}

          {/* 封面模式：显示两个主标题输入框 */}
          {type === 'cover' ? (
            <>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: 'var(--color-text-primary)',
                  fontWeight: 600
                }}>
                  主标题第一行 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(必填)</span>
                </label>
                <input
                  type="text"
                  value={titleLine1}
                  onChange={(e) => setTitleLine1(e.target.value)}
                  placeholder="请输入主标题第一行"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border)',
                    background: 'rgba(255, 255, 255, 0.9)',
                    color: 'var(--color-text-primary)',
                    fontSize: '1rem',
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: 'var(--color-text-primary)',
                  fontWeight: 600
                }}>
                  主标题第二行 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(可选)</span>
                </label>
                <input
                  type="text"
                  value={titleLine2}
                  onChange={(e) => setTitleLine2(e.target.value)}
                  placeholder="请输入主标题第二行"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border)',
                    background: 'rgba(255, 255, 255, 0.9)',
                    color: 'var(--color-text-primary)',
                    fontSize: '1rem',
                  }}
                />
              </div>
            </>
          ) : (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: 'var(--color-text-primary)',
                fontWeight: 600
              }}>
                主标题 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({(type === 'wechat-cover') ? '必填' : '可选'})</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="请输入主标题"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border)',
                  background: 'rgba(255, 255, 255, 0.9)',
                  color: 'var(--color-text-primary)',
                  fontSize: '1rem',
                }}
              />
            </div>
          )}

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              color: 'var(--color-text-primary)',
              fontWeight: 600
            }}>
              副标题 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(可选)</span>
            </label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="请输入副标题"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                background: 'rgba(255, 255, 255, 0.9)',
                color: 'var(--color-text-primary)',
                fontSize: '1rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              color: 'var(--color-text-primary)',
              fontWeight: 600
            }}>
              正文内容 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(可选，内页使用)</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`使用 Markdown 风格标记：
# 一级标题（大节标题）
## 二级标题（分段标题）
普通文本是正文内容

示例：
# 第一章
这是正文内容，会自动换行。

## 第一节
更多正文内容...`}
              rows={8}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                background: 'rgba(255, 255, 255, 0.9)',
                color: 'var(--color-text-primary)',
                fontSize: '1rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          {/* 图片上传区域（仅内页模式） */}
          {type === 'content' && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: 'var(--color-text-primary)',
                fontWeight: 600
              }}>
                插入图片 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(可选，内页使用)</span>
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                style={{ display: 'none' }}
                id="image-upload"
              />
              <label
                htmlFor="image-upload"
                style={{
                  display: 'block',
                  padding: '1rem',
                  border: '2px dashed var(--color-border)',
                  borderRadius: '10px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                  background: 'rgba(255, 255, 255, 0.5)',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.5)';
                }}
              >
                📷 点击上传图片（可多选）
              </label>

              {/* 已上传的图片预览 */}
              {images.length > 0 && (
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {images.map((img, index) => {
                    const paragraphs = content.split('\n').filter((p: string) => p.trim() !== '');
                    const maxPosition = paragraphs.length;
                    return (
                      <div
                        key={img.id}
                        style={{
                          border: '1px solid var(--color-border)',
                          borderRadius: '10px',
                          padding: '1rem',
                          background: 'rgba(255, 255, 255, 0.7)',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                          <img
                            src={img.preview}
                            alt="预览"
                            style={{
                              width: '100px',
                              height: '100px',
                              objectFit: 'cover',
                              borderRadius: '8px',
                              border: '1px solid var(--color-border)',
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ marginBottom: '0.5rem' }}>
                              <label style={{
                                fontSize: '0.9rem',
                                color: 'var(--color-text-secondary)',
                                display: 'block',
                                marginBottom: '0.25rem'
                              }}>
                                插入位置（段落后）：
                              </label>
                              <select
                                value={img.position}
                                onChange={(e) => updateImagePosition(img.id, parseInt(e.target.value))}
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  borderRadius: '6px',
                                  border: '1px solid var(--color-border)',
                                  background: 'white',
                                  color: 'var(--color-text-primary)',
                                  fontSize: '0.9rem',
                                }}
                              >
                                <option value={0}>开头（标题后）</option>
                                {Array.from({ length: maxPosition }, (_, i) => (
                                  <option key={i + 1} value={i + 1}>
                                    第 {i + 1} 段后
                                  </option>
                                ))}
                                <option value={maxPosition + 1}>结尾</option>
                              </select>
                            </div>
                            <button
                              onClick={() => removeImage(img.id)}
                              style={{
                                padding: '0.5rem 1rem',
                                background: 'transparent',
                                border: '1px solid var(--color-accent)',
                                color: 'var(--color-accent)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                transition: 'all 0.3s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--color-accent)';
                                e.currentTarget.style.color = 'white';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--color-accent)';
                              }}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button
            onClick={generateImage}
            disabled={
              loading ||
              (type === 'cover' && !titleLine1.trim()) ||
              (type === 'wechat-cover' && !title.trim()) ||
              (type === 'content' && !title.trim() && !content.trim())
            }
            style={{
              width: '100%',
              padding: '1rem 2rem',
              borderRadius: '25px',
              background:
                loading ||
                  (type === 'cover' && !titleLine1.trim()) ||
                  (type === 'wechat-cover' && !title.trim()) ||
                  (type === 'content' && !title.trim() && !content.trim())
                  ? 'var(--color-text-muted)'
                  : 'var(--color-accent)',
              color: 'white',
              border: 'none',
              fontSize: '1.1rem',
              fontWeight: 600,
              cursor:
                loading ||
                  (type === 'cover' && !titleLine1.trim()) ||
                  (type === 'wechat-cover' && !title.trim()) ||
                  (type === 'content' && !title.trim() && !content.trim())
                  ? 'not-allowed'
                  : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 8px var(--color-shadow)',
            }}
          >
            {loading ? '生成中...' : '生成图片并下载'}
          </button>
            </>
          )}

          {/* 照片分割模式 UI */}
          {type === 'photo-split' && (
            <>
              {/* Step 1: 上传图片 */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: 'var(--color-text-primary)',
                  fontWeight: 600
                }}>
                  1. 上传图片
                </label>
                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                  支持 JPG / PNG。可以：1) 选择多张图片进行批量处理；2) 选择一张包含多张小图的拼图进行网格分割。
                </p>
                <input
                  id="split-upload-input"
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleSplitFileChange}
                />
                <label
                  htmlFor="split-upload-input"
                  style={{
                    display: 'block',
                    padding: '1rem',
                    border: '2px dashed var(--color-border)',
                    borderRadius: '10px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                    background: 'rgba(255, 255, 255, 0.5)',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-accent)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.5)';
                  }}
                >
                  {splitFiles.length > 0 
                    ? `已选择 ${splitFiles.length} 张图片（点击可重新选择）` 
                    : '拖拽图片到这里，或点击选择文件（可多选）'}
                </label>

                {splitFiles.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                      gap: '0.75rem',
                      marginTop: '0.5rem'
                    }}>
                      {splitFiles.map((item, index) => (
                        <div
                          key={item.id}
                          style={{
                            position: 'relative',
                            border: selectedSplitIndex === index ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                            borderRadius: 10,
                            overflow: 'hidden',
                            cursor: 'pointer',
                            background: processingSplitIndex === index ? 'rgba(0, 123, 255, 0.1)' : '#fff',
                          }}
                          onClick={() => setSelectedSplitIndex(index)}
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
                          {processingSplitIndex === index && (
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
                              removeSplitFile(index);
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

                {selectedSplitIndex !== null && splitFiles[selectedSplitIndex] && (
                  <div style={{ marginTop: '1rem' }}>
                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                      选中图片预览：
                    </p>
                    <img
                      src={splitFiles[selectedSplitIndex].previewUrl}
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
              </div>

              {/* Step 2: 智能抠图 */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: 'var(--color-text-primary)',
                  fontWeight: 600
                }}>
                  2. 智能抠图
                </label>
                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                  后端会根据背景颜色自动抠出前景主体，适合纯色或近纯色背景的照片。支持批量处理所有图片！
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleSegment()}
                    disabled={splitFiles.length === 0 || loading}
                    style={{
                      padding: '0.75rem 1.5rem',
                      borderRadius: '25px',
                      background: (splitFiles.length === 0 || loading) ? 'var(--color-text-muted)' : 'var(--color-accent)',
                      color: 'white',
                      border: 'none',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: (splitFiles.length === 0 || loading) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 2px 8px var(--color-shadow)',
                    }}
                  >
                    {loading ? `处理中… (${processingSplitIndex !== null ? processingSplitIndex + 1 : 0}/${splitFiles.length})` : `批量处理所有图片 (${splitFiles.length} 张)`}
                  </button>
                  {selectedSplitIndex !== null && (
                    <button
                      onClick={() => handleSegment(selectedSplitIndex)}
                      disabled={loading}
                      style={{
                        padding: '0.75rem 1.5rem',
                        borderRadius: '25px',
                        background: loading ? 'var(--color-text-muted)' : 'rgba(195, 155, 135, 0.2)',
                        color: loading ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                        border: `1px solid var(--color-border)`,
                        fontSize: '1rem',
                        fontWeight: 600,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      {loading && processingSplitIndex === selectedSplitIndex ? '处理中…' : '处理当前选中'}
                    </button>
                  )}
                </div>

                {selectedSplitIndex !== null && splitFiles[selectedSplitIndex]?.segmentedUrl && (
                  <div style={{ marginTop: '1rem' }}>
                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                      当前选中图片的抠图结果（背景已透明）：
                    </p>
                    <img
                      src={splitFiles[selectedSplitIndex].segmentedUrl}
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
              </div>

              {/* Step 2.5: 网格分割 */}
              <div style={{ marginBottom: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: 'var(--color-text-primary)',
                  fontWeight: 600
                }}>
                  图片网格分割
                </label>
                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
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
                    {[[2,2], [2,3], [3,2], [3,3], [3,5], [5,3], [4,4]].map(([r, c]) => (
                      <button
                        key={`${r}-${c}`}
                        onClick={() => { setGridRows(r); setGridCols(c); }}
                        style={{
                          padding: '0.3rem 0.8rem',
                          fontSize: '0.85rem',
                          borderRadius: '6px',
                          border: '1px solid var(--color-border)',
                          background: gridRows === r && gridCols === c ? 'var(--color-accent)' : 'transparent',
                          color: gridRows === r && gridCols === c ? 'white' : 'var(--color-text-primary)',
                          cursor: 'pointer',
                        }}
                      >
                        {r}×{c} ({r*c}张)
                      </button>
                    ))}
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
                      await handleGridSplit(file);
                      e.target.value = '';
                    }}
                  />
                  <label
                    htmlFor="grid-split-upload"
                    style={{
                      padding: '0.75rem 1.5rem',
                      borderRadius: '25px',
                      background: loading ? 'var(--color-text-muted)' : 'var(--color-accent)',
                      color: 'white',
                      border: 'none',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 2px 8px var(--color-shadow)',
                    }}
                  >
                    {loading ? '分割中…' : `上传并分割为 ${gridRows}×${gridCols} 网格`}
                  </label>
                  {selectedSplitIndex !== null && splitFiles[selectedSplitIndex] && (
                    <button
                      onClick={() => handleGridSplit(splitFiles[selectedSplitIndex].file)}
                      disabled={loading}
                      style={{
                        padding: '0.75rem 1.5rem',
                        borderRadius: '25px',
                        background: loading ? 'var(--color-text-muted)' : 'rgba(195, 155, 135, 0.2)',
                        color: loading ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                        border: '1px solid var(--color-border)',
                        fontSize: '1rem',
                        fontWeight: 600,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      {loading ? '分割中…' : '分割当前选中图片'}
                    </button>
                  )}
                </div>
              </div>

              {/* Step 3: 导出表情包 */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: 'var(--color-text-primary)',
                  fontWeight: 600
                }}>
                  3. 导出表情包
                </label>
                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                  支持标准 512×512 尺寸和 3×3 九宫格导出（共 9 张）。可批量导出所有已处理的图片！
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleExport512()}
                    disabled={splitFiles.filter(f => f.segmentedUrl).length === 0}
                    style={{
                      padding: '0.75rem 1.5rem',
                      borderRadius: '25px',
                      background: splitFiles.filter(f => f.segmentedUrl).length === 0 ? 'var(--color-text-muted)' : 'var(--color-accent)',
                      color: 'white',
                      border: 'none',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: splitFiles.filter(f => f.segmentedUrl).length === 0 ? 'not-allowed' : 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 2px 8px var(--color-shadow)',
                    }}
                  >
                    批量导出所有 512×512 PNG ({splitFiles.filter(f => f.segmentedUrl).length} 张)
                  </button>
                  <button
                    onClick={() => handleExportNine()}
                    disabled={splitFiles.filter(f => f.segmentedUrl).length === 0}
                    style={{
                      padding: '0.75rem 1.5rem',
                      borderRadius: '25px',
                      background: splitFiles.filter(f => f.segmentedUrl).length === 0 ? 'var(--color-text-muted)' : 'rgba(195, 155, 135, 0.2)',
                      color: splitFiles.filter(f => f.segmentedUrl).length === 0 ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: splitFiles.filter(f => f.segmentedUrl).length === 0 ? 'not-allowed' : 'pointer',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    批量导出所有九宫格 ({splitFiles.filter(f => f.segmentedUrl).length * 9} 张)
                  </button>
                  {selectedSplitIndex !== null && splitFiles[selectedSplitIndex]?.segmentedUrl && (
                    <>
                      <button
                        onClick={() => handleExport512(selectedSplitIndex)}
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: '25px',
                          background: 'var(--color-accent)',
                          color: 'white',
                          border: 'none',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                        }}
                      >
                        导出当前 512×512
                      </button>
                      <button
                        onClick={() => handleExportNine(selectedSplitIndex)}
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: '25px',
                          background: 'rgba(195, 155, 135, 0.2)',
                          color: 'var(--color-text-primary)',
                          border: '1px solid var(--color-border)',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                        }}
                      >
                        导出当前九宫格
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{
          marginTop: '2rem',
          padding: '1.5rem',
          background: 'var(--color-card-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: '15px',
          color: 'var(--color-text-secondary)',
          fontSize: '0.9rem',
          lineHeight: '1.6',
        }}>
          <h3 style={{
            color: 'var(--color-text-primary)',
            marginBottom: '0.5rem',
            fontSize: '1.1rem'
          }}>
            使用说明：
          </h3>
          <ul style={{ paddingLeft: '1.5rem', margin: 0 }}>
            <li>小红书封面：适合展示标题和副标题，简洁大气</li>
            <li>公众号封面：2.35:1 横版高清单图，适合微信文章首图</li>
            <li>内页：支持 Markdown 风格标记</li>
            <li>照片分割：支持智能抠图和网格分割功能</li>
            <li style={{ marginTop: '0.5rem' }}><strong>内页格式：</strong></li>
            <li style={{ marginLeft: '1rem' }}>• <code># 标题</code> - 一级标题（52px，字重600）</li>
            <li style={{ marginLeft: '1rem' }}>• <code>## 标题</code> - 二级标题（44px，字重500）</li>
            <li style={{ marginLeft: '1rem' }}>• 普通文本 - 正文（36px，字重400，行距1.6）</li>
            <li style={{ marginTop: '0.5rem' }}>图片尺寸：1242×1656px（小红书），2350×1000px（公众号）</li>
            <li>风格：奶油色背景 + 深咖色文字，与品牌风格一致</li>
            <li>背景图片：均可上传背景图片，文字会自动优化可读性</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
