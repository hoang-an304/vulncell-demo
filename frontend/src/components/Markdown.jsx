// ═══════════════════════════════════════════════════════════════════════════════
// CHẶNG 6 (phần 2) — RENDER MARKDOWN AN TOÀN (components/Markdown.jsx)
//
// Dùng ở: trang Case (nội dung report) và timeline (comment) — mọi chỗ hiển thị Markdown.
// An toàn 2 lớp khi HIỂN THỊ:
//   1. react-markdown mặc định KHÔNG render HTML thô (coi <b> là chữ, không phải thẻ).
//   2. rehype-sanitize lọc lần nữa trước khi ghi vào DOM (defense in depth).
// Code block dùng renderer riêng (CodeBlock) để có header + wrap/copy/collapse + số dòng.
// ═══════════════════════════════════════════════════════════════════════════════
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'; // hỗ trợ bảng, checklist, strikethrough… kiểu GitHub
import rehypeSanitize from 'rehype-sanitize'; // lớp lọc thứ hai trước khi vào DOM
import CodeBlock from './CodeBlock';

export default function Markdown({ children, className = '' }) {
  return (
    <div className={`md-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]} // mở rộng cú pháp Markdown kiểu GitHub
        rehypePlugins={[rehypeSanitize]} // lọc HTML lần cuối
        components={{ pre: CodeBlock }} // thay thẻ <pre> bằng CodeBlock tự viết
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
