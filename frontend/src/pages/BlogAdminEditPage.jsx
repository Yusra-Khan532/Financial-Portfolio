import { useParams } from "react-router-dom";
import AdminShell from "@/components/cms/AdminShell";
import ContentEditor from "@/components/cms/ContentEditor";

export default function BlogAdminEditPage() {
  const { id } = useParams();
  return <AdminShell compact><ContentEditor itemId={id} /></AdminShell>;
}
