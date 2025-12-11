import type { Metadata } from 'next';
import './brand.css';

export const metadata: Metadata = {
  title: '小红书图片生成器',
  description: '生成符合 brand-next 风格的小红书封面和内页图片',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

