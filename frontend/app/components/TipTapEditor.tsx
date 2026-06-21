"use client";

import React, { useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';

interface TipTapEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const TipTapEditor: React.FC<TipTapEditorProps> = ({ value, onChange, placeholder }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'prose prose-sm prose-invert max-w-none min-h-[150px] p-4 bg-surface-1 border border-hairline rounded text-ink-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors',
      },
      handlePaste: (view, event, slice) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of items) {
          if (item.type.indexOf('image') === 0) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              uploadImage(file).then(url => {
                if (url) {
                  const node = view.state.schema.nodes.image.create({ src: url });
                  const transaction = view.state.tr.replaceSelectionWith(node);
                  view.dispatch(transaction);
                }
              });
            }
            return true;
          }
        }
        return false;
      }
    },
    onUpdate: ({ editor }) => {
      // Get the markdown or HTML. For now we will just use HTML to support images cleanly.
      // Or we can use markdown if we add tiptap-markdown. Since we don't have tiptap-markdown, we'll store HTML.
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== value) {
      // Prevent cursor jumping if value didn't actually change
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    // Get token
    const token = localStorage.getItem('token');
    
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.url;
      }
    } catch (e) {
      console.error('Image upload failed', e);
    }
    return null;
  };

  if (!editor) {
    return <div className="h-[150px] bg-surface-1 border border-hairline rounded animate-pulse"></div>;
  }

  return (
    <div className="flex flex-col relative group">
      <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-2 p-1 rounded shadow-md border border-hairline z-10">
        <button 
          onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
          className={`p-1 rounded hover:bg-surface-3 ${editor.isActive('bold') ? 'bg-surface-3 text-primary' : 'text-ink-subtle'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 12h8a4 4 0 100-8H6v8zm0 0h9a4 4 0 110 8H6v-8z"></path></svg>
        </button>
        <button 
          onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
          className={`p-1 rounded hover:bg-surface-3 ${editor.isActive('italic') ? 'bg-surface-3 text-primary' : 'text-ink-subtle'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
        </button>
        <button 
          onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run() }}
          className={`p-1 rounded hover:bg-surface-3 ${editor.isActive('heading', { level: 2 }) ? 'bg-surface-3 text-primary' : 'text-ink-subtle'}`}
        >
          <span className="font-bold text-xs">H2</span>
        </button>
        <button 
          onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run() }}
          className={`p-1 rounded hover:bg-surface-3 ${editor.isActive('bulletList') ? 'bg-surface-3 text-primary' : 'text-ink-subtle'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
};

export default TipTapEditor;
