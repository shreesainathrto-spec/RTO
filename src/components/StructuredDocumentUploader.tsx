import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Upload, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDoc, subscribeToDocsFor, type ClientDoc, updateDoc } from "@/lib/clientDocs";
import {
  ALL_CLIENT_DOCUMENT_TYPES,
  ALL_VEHICLE_DOCUMENT_TYPES,
  getServiceSpecificDocumentTypes,
  type DocumentCategory,
} from "@/lib/documentTypes";
import type { ServiceDetail } from "@/lib/records";
import { formatDate } from "@/lib/formatting";

interface Props {
  clientId: string;
  services?: ServiceDetail[];
  application?: string;
  work?: string;
}

interface UploadState {
  uploading: boolean;
  pct: number;
  error?: string;
}

const SECTION_CONFIG: Array<{ title: DocumentCategory; types: string[] }> = [
  { title: "Client Documents", types: [...ALL_CLIENT_DOCUMENT_TYPES] },
  { title: "Vehicle Documents", types: [...ALL_VEHICLE_DOCUMENT_TYPES] },
];

function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getServiceDocumentTypes(services?: ServiceDetail[], application?: string, work?: string) {
  if (!services?.length) return [] as string[];
  const types = services.flatMap((service) =>
    getServiceSpecificDocumentTypes(service.serviceType, application, work),
  );
  return Array.from(new Set(types));
}

function sortDocsByType(docs: ClientDoc[]) {
  return [...docs].sort((a, b) => a.type.localeCompare(b.type));
}

export function StructuredDocumentUploader({ clientId, services, application, work }: Props) {
  const [docs, setDocs] = useState<ClientDoc[]>([]);
  const [uploadState, setUploadState] = useState<Record<string, UploadState>>({});

  useEffect(() => {
    const unsub = subscribeToDocsFor(clientId, setDocs);
    return unsub;
  }, [clientId]);

  const serviceDocTypes = useMemo(
    () => getServiceDocumentTypes(services, application, work),
    [services, application, work],
  );

  const docsByType = useMemo(() => {
    const map = new Map<string, ClientDoc[]>();
    docs.forEach((doc) => {
      const existing = map.get(doc.type) ?? [];
      existing.push(doc);
      map.set(doc.type, existing);
    });
    return map;
  }, [docs]);

  const getCurrentDoc = (type: string) => docsByType.get(type)?.[0];

  const setState = (type: string, next: Partial<UploadState>) => {
    setUploadState((prev) => ({
      ...prev,
      [type]: { ...prev[type], ...next },
    }));
  };

  const handleFileSelected = async (type: string, file: File) => {
    if (!file) return;
    setState(type, { uploading: true, pct: 0, error: undefined });

    const existingDoc = getCurrentDoc(type);
    const targetName = type;

    try {
      const updated = existingDoc
        ? await updateDoc(existingDoc.id, clientId, targetName, type, file, (pct) =>
            setState(type, { pct }),
          )
        : await addDoc(clientId, targetName, type, file, (pct) => setState(type, { pct }));

      setDocs((current) => {
        const updatedMap = new Map(current.map((doc) => [doc.id, doc]));
        updatedMap.set(updated.id, updated);
        return sortDocsByType(Array.from(updatedMap.values()));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState(type, { error: message });
    } finally {
      setState(type, { uploading: false, pct: 0 });
    }
  };

  const handleReplace = (type: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,image/*,.doc,.docx";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) handleFileSelected(type, file);
    };
    input.click();
  };

  const handleUploadNew = (type: string) => {
    handleReplace(type);
  };

  const hasAnyServiceDocs = serviceDocTypes.length > 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
        <div>
          <div className="text-sm font-semibold">Client Documents</div>
          <p className="text-xs text-muted-foreground">
            Use separate slots for each client document type.
          </p>
        </div>

        <div className="grid gap-3">
          {SECTION_CONFIG[0].types.map((docType) => {
            const existingDoc = getCurrentDoc(docType);
            const state = uploadState[docType] ?? { uploading: false, pct: 0 };

            return (
              <div
                key={docType}
                className="rounded-xl border bg-card p-3 grid gap-2 sm:grid-cols-[1fr_auto] items-center"
              >
                <div>
                  <div className="font-semibold">{docType}</div>
                  {existingDoc ? (
                    <div className="text-xs text-muted-foreground">
                      Uploaded {formatDate(existingDoc.addedAt)} •{" "}
                      {formatFileSize(existingDoc.fileSize)}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No document uploaded yet.</div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {existingDoc?.downloadURL ? (
                    <a
                      href={existingDoc.downloadURL}
                      target="_blank"
                      rel="noreferrer"
                      download
                      className="inline-flex items-center gap-1 rounded-full border border-input px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
                    >
                      <ExternalLink className="size-3" /> View
                    </a>
                  ) : null}
                  {existingDoc ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReplace(docType)}
                      disabled={state.uploading}
                    >
                      {state.uploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                      Replace
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleUploadNew(docType)}
                      disabled={state.uploading}
                    >
                      {state.uploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      Upload
                    </Button>
                  )}
                </div>
                {state.uploading && (
                  <div className="sm:col-span-2">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${state.pct}%` }}
                      />
                    </div>
                  </div>
                )}
                {state.error && (
                  <div className="text-xs text-destructive sm:col-span-2">{state.error}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
        <div>
          <div className="text-sm font-semibold">Vehicle Documents</div>
          <p className="text-xs text-muted-foreground">
            Upload vehicle-specific files under each document type.
          </p>
        </div>

        <div className="grid gap-3">
          {SECTION_CONFIG[1].types.map((docType) => {
            const existingDoc = getCurrentDoc(docType);
            const state = uploadState[docType] ?? { uploading: false, pct: 0 };

            return (
              <div
                key={docType}
                className="rounded-xl border bg-card p-3 grid gap-2 sm:grid-cols-[1fr_auto] items-center"
              >
                <div>
                  <div className="font-semibold">{docType}</div>
                  {existingDoc ? (
                    <div className="text-xs text-muted-foreground">
                      Uploaded {formatDate(existingDoc.addedAt)} •{" "}
                      {formatFileSize(existingDoc.fileSize)}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No document uploaded yet.</div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {existingDoc?.downloadURL ? (
                    <a
                      href={existingDoc.downloadURL}
                      target="_blank"
                      rel="noreferrer"
                      download
                      className="inline-flex items-center gap-1 rounded-full border border-input px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
                    >
                      <ExternalLink className="size-3" /> View
                    </a>
                  ) : null}
                  {existingDoc ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReplace(docType)}
                      disabled={state.uploading}
                    >
                      {state.uploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                      Replace
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleUploadNew(docType)}
                      disabled={state.uploading}
                    >
                      {state.uploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      Upload
                    </Button>
                  )}
                </div>
                {state.uploading && (
                  <div className="sm:col-span-2">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${state.pct}%` }}
                      />
                    </div>
                  </div>
                )}
                {state.error && (
                  <div className="text-xs text-destructive sm:col-span-2">{state.error}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {hasAnyServiceDocs && (
        <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
          <div>
            <div className="text-sm font-semibold">Service Documents</div>
            <p className="text-xs text-muted-foreground">
              This section appears automatically for selected services.
            </p>
          </div>

          <div className="grid gap-3">
            {serviceDocTypes.map((docType) => {
              const existingDoc = getCurrentDoc(docType);
              const state = uploadState[docType] ?? { uploading: false, pct: 0 };

              return (
                <div
                  key={docType}
                  className="rounded-xl border bg-card p-3 grid gap-2 sm:grid-cols-[1fr_auto] items-center"
                >
                  <div>
                    <div className="font-semibold">{docType}</div>
                    {existingDoc ? (
                      <div className="text-xs text-muted-foreground">
                        Uploaded {formatDate(existingDoc.addedAt)} •{" "}
                        {formatFileSize(existingDoc.fileSize)}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        No document uploaded yet for this service.
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 justify-end">
                    {existingDoc?.downloadURL ? (
                      <a
                        href={existingDoc.downloadURL}
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="inline-flex items-center gap-1 rounded-full border border-input px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
                      >
                        <ExternalLink className="size-3" /> View
                      </a>
                    ) : null}
                    {existingDoc ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReplace(docType)}
                        disabled={state.uploading}
                      >
                        {state.uploading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RotateCcw className="size-4" />
                        )}
                        Replace
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleUploadNew(docType)}
                        disabled={state.uploading}
                      >
                        {state.uploading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Upload className="size-4" />
                        )}
                        Upload
                      </Button>
                    )}
                  </div>
                  {state.uploading && (
                    <div className="sm:col-span-2">
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${state.pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {state.error && (
                    <div className="text-xs text-destructive sm:col-span-2">{state.error}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
