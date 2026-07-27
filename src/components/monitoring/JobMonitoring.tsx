
import React, { useEffect, useState } from 'react';
import { databricksService, DatabricksJob } from '../../services/databricksService';
import { Database, Zap, Clock, ShieldCheck, AlertTriangle, Loader2, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

export function JobMonitoring() {
  const [jobs, setJobs] = useState<DatabricksJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchJobs = async () => {
    setLoading(true);
    const data = await databricksService.listJobs();
    if (data && data.jobs) {
      setJobs(data.jobs);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleCreateMockJob = async () => {
    setCreating(true);
    // This is the config provided by the user
    const config = {
      "name": "Nightly model training",
      "new_cluster": {
        "spark_version": "7.3.x-scala2.12",
        "node_type_id": "r3.xlarge",
        "aws_attributes": {
          "availability": "ON_DEMAND"
        },
        "num_workers": 10
      },
      "libraries": [
        { "jar": "dbfs:/my-jar.jar" },
        { "maven": { "coordinates": "org.jsoup:jsoup:1.7.2" } }
      ],
      "timeout_seconds": 3600,
      "max_retries": 1,
      "schedule": {
        "quartz_cron_expression": "0 15 22 * * ?",
        "timezone_id": "America/Los_Angeles"
      },
      "spark_jar_task": {
        "main_class_name": "com.databricks.ComputeModels"
      }
    };
    
    const result = await databricksService.createJob(config);
    if (result) {
      fetchJobs();
    }
    setCreating(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tighter text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600" />
            Processamento de IA
          </h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
            Gestão de tarefas de alto desempenho & Treino de modelos
          </p>
        </div>
        
        <button 
          onClick={handleCreateMockJob}
          disabled={creating}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-indigo-200"
        >
          {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
          Agendar Treino Nocturno
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <span className="text-[10px] font-black uppercase tracking-widest">A sincronizar com Databricks...</span>
          </div>
        ) : jobs.length === 0 ? (
          <div className="col-span-full border-2 border-dashed border-slate-200 rounded-3xl py-20 flex flex-col items-center justify-center text-slate-400 gap-4">
            <Zap className="w-8 h-8 opacity-20" />
            <span className="text-[10px] font-black uppercase tracking-widest">Nenhuma tarefa activa</span>
          </div>
        ) : (
          jobs.map((job) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={job.job_id}
              className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col gap-4 relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-3">
                <ShieldCheck className="w-4 h-4 text-emerald-500 opacity-20 group-hover:opacity-100 transition-opacity" />
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase">
                    Job #{job.job_id}
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    Cluster: {job.settings?.new_cluster?.node_type_id || 'Auto'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="bg-slate-50 p-2 rounded-xl">
                  <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Agendamento</span>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="text-[9px] font-bold">{job.settings?.schedule?.quartz_cron_expression || 'Manual'}</span>
                  </div>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl">
                  <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Estado</span>
                  <div className="flex items-center gap-1.5 text-emerald-600">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-black uppercase">Ativo</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                <div className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Retries: {job.settings?.max_retries || 0}</span>
                </div>
                <button className="text-[8px] font-black uppercase text-indigo-600 hover:underline tracking-widest">
                  Ver Logs
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
