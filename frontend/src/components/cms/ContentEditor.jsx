import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import RichTextEditor from "@/components/cms/RichTextEditor";
import { cmsRequest, formatCmsDateTime } from "@/lib/cms";

const CONTENT_TYPES = [
  ["ARTICLE", "Article"],
  ["PDF", "Report / PDF"],
  ["SPREADSHEET", "Spreadsheet"],
  ["IMAGE", "Visual / image"],
  ["FILE", "File"],
];

const RESOURCE_UPLOAD_COPY = {
  PDF: ["Upload PDF", "PDF file required"],
  SPREADSHEET: ["Upload Spreadsheet", "XLSX, XLS or CSV required"],
  IMAGE: ["Upload Image", "PNG, JPG or WEBP required"],
  FILE: ["Upload File", "PDF, spreadsheet or image file required"],
};

const EMPTY_CONTENT = {
  title: "",
  slug: "",
  excerpt: "",
  contentType: "ARTICLE",
  articleBody: "",
  articleFormat: "HTML",
  coverImageUrl: "",
  coverImageKey: "",
  inlineImageKeys: [],
  fileKey: "",
  author: "Nishant Jain",
  status: "DRAFT",
};

export default function ContentEditor({ itemId }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_CONTENT);
  const [loading, setLoading] = useState(Boolean(itemId));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const isEditing = Boolean(itemId);

  useEffect(() => {
    if (!itemId) return;
    cmsRequest(`/content/admin/items/${itemId}`)
      .then((item) => {
        setForm({
          ...EMPTY_CONTENT,
          ...item,
          coverImageUrl: item.coverImageUrl || "",
          coverImageKey: item.coverImageKey || "",
          inlineImageKeys: item.inlineImageKeys || [],
          fileKey: item.fileKey || "",
          articleBody: item.articleFormat === "HTML" ? item.articleBody || "" : item.articleHtml || "",
          articleFormat: "HTML",
        });
      })
      .catch((requestError) => {
        if (requestError.status === 401) navigate("/blog/admin/login", { replace: true });
        else setError(requestError.message);
      })
      .finally(() => setLoading(false));
  }, [itemId, navigate]);

  useEffect(() => {
    const warn = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setField = (field) => (event) => {
    setDirty(true);
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const changeContentType = (event) => {
    const contentType = event.target.value;
    setDirty(true);
    setForm((current) => ({
      ...current,
      contentType,
      ...(current.contentType !== contentType ? { fileKey: "", fileUrl: "", originalFileName: "", mimeType: "", fileSize: null } : {}),
    }));
  };

  const fileAccept = useMemo(() => ({
    PDF: ".pdf",
    SPREADSHEET: ".xlsx,.xls,.csv",
    IMAGE: ".png,.jpg,.jpeg,.webp",
    FILE: ".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp",
  })[form.contentType], [form.contentType]);

  const uploadAsset = async (file) => {
    setUploading(true);
    setError("");
    const body = new FormData();
    body.append("file", file);
    try {
      const asset = await cmsRequest("/content/admin/upload", { method: "POST", body });
      return asset;
    } catch (requestError) {
      if (requestError.status === 401) navigate("/blog/admin/login", { replace: true });
      else {
        setError(requestError.message);
        toast.error(requestError.message);
      }
      throw requestError;
    } finally {
      setUploading(false);
    }
  };

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const asset = await uploadAsset(file);
      setForm((current) => ({ ...current, fileKey: asset.key, fileUrl: asset.fileUrl, originalFileName: asset.originalFileName, mimeType: asset.mimeType, fileSize: asset.fileSize }));
      setDirty(true);
      toast.success(`${asset.originalFileName} is ready.`);
    } catch {
      // uploadAsset already provided feedback.
    }
  };

  const uploadCover = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const asset = await uploadAsset(file);
      setForm((current) => ({ ...current, coverImageKey: asset.key, coverImageUrl: "", coverImageName: asset.originalFileName }));
      setDirty(true);
      toast.success("Cover image uploaded.");
    } catch {
      // uploadAsset already provided feedback.
    }
  };

  const uploadInlineImage = async (file) => {
    const asset = await uploadAsset(file);
    setForm((current) => ({ ...current, inlineImageKeys: [...new Set([...current.inlineImageKeys, asset.key])] }));
    setDirty(true);
    toast.success("Image uploaded.");
    return { key: asset.key, url: asset.fileUrl };
  };

  const validate = () => {
    if (!form.title.trim()) return "Title is required.";
    if (!form.excerpt.trim()) return "A short description is required.";
    const readableBody = form.articleBody.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    if (form.contentType === "ARTICLE" && !readableBody && !form.articleBody.includes("<img")) return "Article body is required.";
    if (form.contentType !== "ARTICLE" && !form.fileKey) return "Upload a resource file before saving.";
    return "";
  };

  const save = async (event) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) return setError(validationError);
    const requestedStatus = event.nativeEvent.submitter?.value || form.status;
    setSaving(true);
    setError("");
    try {
      const saved = await cmsRequest(`/content/admin/items${isEditing ? `/${itemId}` : ""}`, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify({ ...form, articleFormat: "HTML", status: requestedStatus }),
      });
      setDirty(false);
      toast.success(requestedStatus === "PUBLISHED" ? "Published successfully." : isEditing ? "Changes saved." : "Draft saved.");
      if (requestedStatus === "PUBLISHED" || isEditing) {
        navigate("/blog/admin", { replace: true });
      } else {
        navigate(`/blog/admin/edit/${saved.id}`, { replace: true });
      }
    } catch (requestError) {
      if (requestError.status === 401) navigate("/blog/admin/login", { replace: true });
      else {
        setError(requestError.message);
        toast.error(requestedStatus === "PUBLISHED" ? `Unable to publish. ${requestError.message}` : requestError.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const leave = (event) => {
    if (dirty && !window.confirm("Discard your unsaved changes?")) event.preventDefault();
  };

  if (loading) return <div className="py-24 text-center text-sm text-[#71839A]">Loading content…</div>;

  return (
    <>
      <div className="mt-9 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
        <div>
          <div className="text-[11px] uppercase tracking-[.22em] text-[#F5A623]">Administrator</div>
          <h1 className="mt-2 font-serif-display text-5xl md:text-6xl text-white">{isEditing ? "Edit research" : "Create research"}</h1>
          <p className="mt-3 text-sm text-[#94A3B8]">{isEditing ? "Refine the content, attachment and publishing state." : "Prepare an article or research resource for publication."}</p>
        </div>
        {isEditing && <div className="text-xs text-[#71839A]">Last updated {formatCmsDateTime(form.updatedAt)}</div>}
      </div>

      <form onSubmit={save} className="mt-9 grid lg:grid-cols-[minmax(0,1fr)_290px] gap-7 items-start">
        <div className="rounded-2xl border border-white/10 bg-[#08172C]/70 p-5 md:p-7 space-y-6">
          <Field label="Title" required>
            <input className="cms-input" value={form.title} onChange={setField("title")} placeholder="A clear research title" />
          </Field>
          <Field label="Slug" hint="Optional — generated from the title if left blank">
            <input className="cms-input" value={form.slug} onChange={setField("slug")} placeholder="research-note-title" />
          </Field>
          <Field label="Short description" required hint={`${form.excerpt.length}/500`}>
            <textarea className="cms-input min-h-24 resize-y" maxLength={500} value={form.excerpt} onChange={setField("excerpt")} placeholder="A concise summary shown in the research index" />
          </Field>
          <Field label="Content type" required>
            <select className="cms-input" value={form.contentType} onChange={changeContentType}>
              {CONTENT_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </Field>
          {form.contentType === "ARTICLE" ? (
            <Field label="Article body" required hint="Format text and insert securely hosted images">
              <RichTextEditor value={form.articleBody} onChange={(articleBody) => { setForm((current) => ({ ...current, articleBody, articleFormat: "HTML" })); setDirty(true); }} onUploadImage={uploadInlineImage} disabled={uploading} />
            </Field>
          ) : (
            <Field label={RESOURCE_UPLOAD_COPY[form.contentType][0]} required hint={`${RESOURCE_UPLOAD_COPY[form.contentType][1]}; maximum 15 MB`}>
              {form.fileKey ? <div className="rounded-lg border border-[#75B89B]/25 bg-[#75B89B]/5 p-4"><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"><div className="min-w-0"><div className="truncate text-sm text-white">{form.originalFileName}</div><div className="mt-1 text-xs text-[#94A3B8]">{formatFileSize(form.fileSize)} · {form.mimeType}</div><div className="mt-2 text-[10px] uppercase tracking-[.14em] text-[#8CC8AA]">Uploaded</div></div><div className="flex items-center gap-4 text-xs"><label className="cursor-pointer text-[#E7C56B] hover:text-[#F5A623]">Replace<input key={form.fileKey} className="sr-only" type="file" accept={fileAccept} onChange={upload} disabled={uploading} /></label><button type="button" onClick={() => { setForm((current) => ({ ...current, fileKey: "", fileUrl: "", originalFileName: "", mimeType: "", fileSize: null })); setDirty(true); }} className="text-[#C98182] hover:text-[#E7A5A6]">Remove</button></div></div></div> : <label className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-white/20 bg-[#07182F] px-4 py-5 cursor-pointer hover:border-[#F5A623]/60">
                <span className="text-sm text-[#CBD5E1]">{uploading ? "Uploading…" : RESOURCE_UPLOAD_COPY[form.contentType][0]}</span>
                <span className="text-xs text-[#E7C56B]">Browse</span>
                <input key={form.contentType} className="sr-only" type="file" accept={fileAccept} onChange={upload} disabled={uploading} />
              </label>}
            </Field>
          )}
          <Field label="Cover image" hint="PNG, JPG or WEBP; maximum 15 MB">
            <label className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-white/20 bg-[#07182F] px-4 py-5 cursor-pointer hover:border-[#F5A623]/60">
              <span className="text-sm text-[#CBD5E1]">{uploading ? "Uploading…" : form.coverImageName || (form.coverImageKey ? "Uploaded cover image" : "Upload Cover Image")}</span>
              <span className="text-xs text-[#E7C56B]">Browse</span>
              <input className="sr-only" type="file" accept=".png,.jpg,.jpeg,.webp" onChange={uploadCover} disabled={uploading} />
            </label>
            {form.coverImageKey && <button type="button" className="mt-2 text-xs text-[#C98182]" onClick={() => { setForm((current) => ({ ...current, coverImageKey: "", coverImageName: "" })); setDirty(true); }}>Remove uploaded cover</button>}
            <div className="mt-4 text-[11px] uppercase tracking-[.14em] text-[#71839A]">Or use an external HTTPS URL</div>
            <input className="cms-input mt-2" type="url" value={form.coverImageUrl} onChange={(event) => { const coverImageUrl = event.target.value; setForm((current) => ({ ...current, coverImageUrl, coverImageKey: coverImageUrl ? "" : current.coverImageKey })); setDirty(true); }} placeholder="https://…" />
          </Field>
        </div>

        <aside className="rounded-2xl border border-white/10 bg-[#0A1E3F]/35 p-5 lg:sticky lg:top-32">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-white">Publishing</span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] tracking-[.14em] ${form.status === "PUBLISHED" ? "border-[#75B89B]/30 text-[#8CC8AA] bg-[#75B89B]/10" : "border-white/15 text-[#94A3B8]"}`}>{form.status}</span>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[#71839A]">Drafts stay private. Publishing makes this item visible on the public Blog.</p>
          {error && <p role="alert" className="mt-5 rounded-lg border border-[#C98182]/25 bg-[#C98182]/5 p-3 text-sm text-[#D99B9C]">{error}</p>}
          <div className="mt-6 grid gap-3">
            <button type="submit" value={form.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT"} disabled={saving || uploading} className="rounded-full border border-white/20 px-5 py-3 text-sm text-white hover:border-white/40 disabled:opacity-50">
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Save Draft"}
            </button>
            {form.status !== "PUBLISHED" ? (
              <button type="submit" value="PUBLISHED" disabled={saving || uploading} className="rounded-full bg-[#F5A623] px-5 py-3 text-sm font-medium text-[#050E1D] hover:bg-[#FFB33B] disabled:opacity-50">Publish</button>
            ) : (
              <button type="submit" value="DRAFT" disabled={saving || uploading} className="rounded-full bg-[#F5A623] px-5 py-3 text-sm font-medium text-[#050E1D] hover:bg-[#FFB33B] disabled:opacity-50">Unpublish</button>
            )}
            {isEditing && <Link onClick={leave} to={`/blog/admin/preview/${itemId}`} className="text-center text-sm text-[#E7C56B] hover:text-[#F5A623]">Preview</Link>}
            <Link onClick={leave} to="/blog/admin" className="text-center text-xs text-[#71839A] hover:text-white">Back to dashboard</Link>
          </div>
        </aside>
      </form>
    </>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-4 text-sm text-[#D6DEE8]">
        <span>{label}{required && <span className="ml-1 text-[#F5A623]">*</span>}</span>
        {hint && <span className="text-[11px] text-[#71839A]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function formatFileSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return "Size unavailable";
  const size = Number(bytes);
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`;
}
