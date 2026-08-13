import { useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold, Italic, Underline, List, ListOrdered, Quote, Link as LinkIcon,
  ImagePlus, Minus, Undo2, Redo2,
} from "lucide-react";

export default function RichTextEditor({ value, onChange, onUploadImage, disabled }) {
  const fileInput = useRef(null);
  const [linkPanel, setLinkPanel] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, protocols: ["https"] },
      }),
      Image.configure({ allowBase64: false, inline: false }),
    ],
    content: value || "<p></p>",
    editorProps: { attributes: { class: "cms-rich-content" } },
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
  });

  if (!editor) return <div className="min-h-[340px] rounded-lg border border-white/10 bg-[#07182F]" />;

  const editLink = () => {
    setLinkUrl(editor.getAttributes("link").href || "https://");
    setLinkError("");
    setLinkPanel(true);
  };

  const applyLink = () => {
    try {
      const parsed = new URL(linkUrl);
      if (parsed.protocol !== "https:") throw new Error();
      editor.chain().focus().extendMarkRange("link").setLink({ href: parsed.toString() }).run();
      setLinkPanel(false);
    } catch {
      setLinkError("Enter a valid HTTPS URL.");
    }
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkPanel(false);
  };

  const insertImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const image = await onUploadImage(file);
      editor.chain().focus().setImage({ src: image.url, alt: file.name.replace(/\.[^.]+$/, "") }).run();
    } catch {
      // The parent upload flow already shows the server or network error.
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="cms-editor overflow-hidden rounded-lg border border-white/10 bg-[#07182F] focus-within:border-[#F5A623]">
      <div className="flex flex-wrap gap-1 border-b border-white/10 bg-[#061326] p-2">
        <ToolbarButton label="Paragraph" text="P" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()} />
        {[1, 2, 3].map((level) => <ToolbarButton key={level} label={`Heading ${level}`} text={`H${level}`} active={editor.isActive("heading", { level })} onClick={() => editor.chain().focus().toggleHeading({ level }).run()} />)}
        <Divider />
        <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold /></ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic /></ToolbarButton>
        <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline /></ToolbarButton>
        <Divider />
        <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List /></ToolbarButton>
        <ToolbarButton label="Ordered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered /></ToolbarButton>
        <ToolbarButton label="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote /></ToolbarButton>
        <ToolbarButton label="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus /></ToolbarButton>
        <Divider />
        <ToolbarButton label="Add or edit link" active={editor.isActive("link")} onClick={editLink}><LinkIcon /></ToolbarButton>
        <ToolbarButton label={uploading ? "Uploading image" : "Insert image"} disabled={uploading || disabled} onClick={() => fileInput.current?.click()}><ImagePlus /></ToolbarButton>
        <input ref={fileInput} className="sr-only" type="file" accept=".png,.jpg,.jpeg,.webp" onChange={insertImage} />
        <Divider />
        <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 /></ToolbarButton>
        <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 /></ToolbarButton>
      </div>
      {linkPanel && <div className="flex flex-col sm:flex-row gap-2 border-b border-white/10 bg-[#08172C] p-3"><div className="min-w-0 flex-1"><input aria-label="HTTPS link URL" autoFocus className="cms-input" value={linkUrl} onChange={(event) => { setLinkUrl(event.target.value); setLinkError(""); }} placeholder="https://example.com" />{linkError && <p className="mt-1 text-xs text-[#D99B9C]">{linkError}</p>}</div><button type="button" onClick={applyLink} className="self-start rounded-full bg-[#F5A623] px-4 py-2 text-xs font-medium text-[#050E1D]">Apply</button>{editor.isActive("link") && <button type="button" onClick={removeLink} className="self-start px-3 py-2 text-xs text-[#C98182]">Remove</button>}<button type="button" onClick={() => setLinkPanel(false)} className="self-start px-3 py-2 text-xs text-[#94A3B8]">Cancel</button></div>}
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({ label, text, active, disabled, onClick, children }) {
  return <button type="button" title={label} aria-label={label} aria-pressed={active || undefined} disabled={disabled} onClick={onClick} className={`flex h-8 min-w-8 items-center justify-center rounded px-2 text-xs transition-colors [&_svg]:h-4 [&_svg]:w-4 ${active ? "bg-[#F5A623] text-[#050E1D]" : "text-[#CBD5E1] hover:bg-white/10 hover:text-white"} disabled:opacity-30`}>{children || text}</button>;
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-8 w-px bg-white/10" />;
}
