import { useEffect, useState } from "react";
import { cmsRequest } from "@/lib/cms";
import { startPremiumReportPolling } from "@/lib/premiumReportPolling";
import { rememberPremiumReport, currentPremiumReport } from "@/lib/currentPremiumReport";
import { downloadPremiumReport } from "@/lib/premiumReportDownload";

// Own the current report lifecycle; the page and detail view only render state.
export default function usePremiumReport({ reportId, navigate }) {
  const [query, setQuery] = useState("");
  const [basis, setBasis] = useState("consolidated");
  const [suggestions, setSuggestions] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [connectionIssue, setConnectionIssue] = useState("");
  const authError = (err) => {
    if (err.status === 401) {
      navigate("/blog/admin/login", { replace: true });
    } else {
      setError(err.message);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (query.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      cmsRequest(`/stocks/admin/fundamentals/search?query=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal
      }).then(data => {
        if (!controller.signal.aborted) setSuggestions(data.items);
      }).catch(err => {
        if (!controller.signal.aborted && err.status === 401) navigate("/blog/admin/login", {
          replace: true
        });
      });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, navigate]);
  useEffect(() => {
    setReport(null);
    setError("");
    setConnectionIssue("");
    if (!reportId) {
      setLoading(false);
      return undefined;
    }
    const snapshot = currentPremiumReport(reportId);
    if (snapshot) {
      setReport(snapshot);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return startPremiumReportPolling({
      load: signal => cmsRequest(`/premium-reports/${reportId}`, {
        signal
      }),
      onData: data => {
        setReport(data);
        setLoading(false);
        setConnectionIssue("");
      },
      onRetry: delay => {
        setLoading(false);
        setConnectionIssue(`The connection was interrupted. Retrying automatically in ${Math.ceil(delay / 1000)} seconds. Your report may still be generating.`);
      },
      onError: err => {
        setLoading(false);
        setConnectionIssue("");
        if (err.status === 404) setReport(null);
        if (err.status === 401) {
          navigate("/blog/admin/login", { replace: true });
        } else {
          setError(err.message);
        }
      }
    });
  }, [reportId, retry, navigate]);
  const generate = async (symbol = query, statement = basis) => {
    setSubmitting(true);
    setError("");
    try {
      const data = await cmsRequest("/premium-reports", {
        method: "POST",
        body: JSON.stringify({
          query: symbol.trim(),
          statement_type: statement,
          delivery: "inline"
        })
      });
      if (data.state === "ready" && data.snapshotReceipt) rememberPremiumReport(data);
      navigate(`/blog/admin/premium-reports/${data.id}`);
    } catch (err) {
      authError(err);
    } finally {
      setSubmitting(false);
    }
  };
  const download = async () => {
    setDownloading(true);
    setError("");
    try {
      await downloadPremiumReport(report, reportId);
    } catch (err) {
      authError(err);
    } finally {
      setDownloading(false);
    }
  };
  return {
    query,
    setQuery,
    basis,
    setBasis,
    suggestions,
    report,
    loading,
    submitting,
    downloading,
    error,
    setError,
    connectionIssue,
    busy: submitting || report?.state === "generating",
    retryLoading: () => setRetry(value => value + 1),
    generate,
    download
  };
}
