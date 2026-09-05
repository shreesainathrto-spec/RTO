import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Search, Database } from "lucide-react";

export const Route = createFileRoute("/dashboard/check-completed")({
  component: CheckCompletedPage,
});

function CheckCompletedPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setSearched(true);
    const matched: any[] = [];
    const term = searchTerm.trim();
    const termUpper = term.toUpperCase();

    try {
      // 1. Check registry_tasks by ID
      const tDocRef = doc(db, "registry_tasks", term);
      const tSnap = await getDoc(tDocRef);
      if (tSnap.exists()) {
        matched.push({
          collection: "registry_tasks",
          id: tSnap.id,
          data: tSnap.data(),
        });
      }

      // 2. Check registry_tasks by task-app-ID fallback
      if (!term.startsWith("task-app-")) {
        const tAppDocRef = doc(db, "registry_tasks", `task-app-${term}`);
        const tAppSnap = await getDoc(tAppDocRef);
        if (tAppSnap.exists()) {
          matched.push({
            collection: "registry_tasks",
            id: tAppSnap.id,
            data: tAppSnap.data(),
          });
        }
      }

      // 3. Query registry_tasks by applicationId or vehicleNumber
      const qTasksApp = query(collection(db, "registry_tasks"), where("applicationId", "==", term));
      const sTasksApp = await getDocs(qTasksApp);
      sTasksApp.docs.forEach((d) => {
        if (!matched.some((m) => m.id === d.id)) {
          matched.push({ collection: "registry_tasks", id: d.id, data: d.data() });
        }
      });

      const qTasksVeh = query(collection(db, "registry_tasks"), where("vehicleNumber", "==", termUpper));
      const sTasksVeh = await getDocs(qTasksVeh);
      sTasksVeh.docs.forEach((d) => {
        if (!matched.some((m) => m.id === d.id)) {
          matched.push({ collection: "registry_tasks", id: d.id, data: d.data() });
        }
      });

      // 4. Check registry_services_v2 by ID
      const sDocRef = doc(db, "registry_services_v2", term);
      const sSnap = await getDoc(sDocRef);
      if (sSnap.exists()) {
        matched.push({
          collection: "registry_services_v2",
          id: sSnap.id,
          data: sSnap.data(),
        });
      }

      // 5. Query registry_services_v2 by applicationId or vehicleId
      const qSvcApp = query(collection(db, "registry_services_v2"), where("applicationId", "==", term));
      const sSvcApp = await getDocs(qSvcApp);
      sSvcApp.docs.forEach((d) => {
        if (!matched.some((m) => m.id === d.id)) {
          matched.push({ collection: "registry_services_v2", id: d.id, data: d.data() });
        }
      });

      const qSvcVeh = query(collection(db, "registry_services_v2"), where("vehicleId", "==", termUpper));
      const sSvcVeh = await getDocs(qSvcVeh);
      sSvcVeh.docs.forEach((d) => {
        if (!matched.some((m) => m.id === d.id)) {
          matched.push({ collection: "registry_services_v2", id: d.id, data: d.data() });
        }
      });

      setResults(matched);
    } catch (err) {
      console.error("Error checking task DB:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Database className="size-6 text-indigo-600" />
          Task Completion Database Checker
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Verify if completed task/service records are properly synchronized and saved in Firestore.
        </p>
      </div>

      <Card className="shadow-sm border border-slate-100 rounded-2xl overflow-hidden bg-white">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">Search Completed Records</CardTitle>
          <CardDescription className="text-xs">
            Enter Application ID (e.g. APL-...), Task ID (e.g. task-app-...), or Vehicle Number to retrieve records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                placeholder="Search by ID, App No, or Vehicle No..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 text-xs font-mono"
              />
            </div>
            <Button type="submit" disabled={loading} className="h-10 text-xs font-semibold px-5">
              {loading ? "Searching..." : "Check DB"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {searched && (
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Search Results ({results.length})
          </h3>

          {results.length === 0 ? (
            <Card className="p-8 text-center text-slate-400 border border-dashed rounded-2xl">
              <XCircle className="size-8 mx-auto mb-2 text-rose-400" />
              <p className="text-xs font-medium">No records found matching "{searchTerm}" in registry_tasks or registry_services_v2.</p>
            </Card>
          ) : (
            <div className="grid gap-3">
              {results.map((r, i) => {
                const status = r.data.status || r.data.taskStatus || "Read";
                const isCompleted = status === "Completed" || r.data.done === true;

                return (
                  <Card key={i} className="shadow-sm border border-slate-100 rounded-2xl overflow-hidden bg-white">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                      <div>
                        <Badge variant="outline" className="text-[10px] font-mono uppercase bg-slate-50">
                          Collection: {r.collection}
                        </Badge>
                        <CardTitle className="text-xs font-mono mt-1 text-indigo-600 select-all">
                          ID: {r.id}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isCompleted ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 text-[10px] font-bold">
                            <CheckCircle2 className="size-3" />
                            COMPLETED IN DB
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                            STATUS: {status.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="text-xs font-mono bg-slate-50/50 p-4 border-t border-slate-100">
                      <pre className="overflow-x-auto text-[10px] leading-relaxed text-slate-600 max-h-[300px]">
                        {JSON.stringify(r.data, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
