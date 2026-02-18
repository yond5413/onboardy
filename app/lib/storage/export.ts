import { createClient } from '@/app/lib/supabase/server';

const BUCKET_NAME = 'analysis-outputs';

export interface ExportPaths {
  design?: string;
  diagram?: string;
  context?: string;
  script?: string;
}

export interface AnalysisExportData {
  markdown: string;
  diagramJson?: string;
  contextJson?: string;
  script?: string;
}

export async function exportAnalysisOutputs(
  jobId: string,
  data: AnalysisExportData
): Promise<ExportPaths> {
  const supabase = await createClient();
  const exportPaths: ExportPaths = {};
  const jobIdPath = jobId;

  const uploadFile = async (
    fileName: string,
    content: string,
    contentType: string
  ): Promise<string | null> => {
    try {
      const filePath = `${jobIdPath}/${fileName}`;
      
      const { data: uploadData, error } = await supabase
        .storage
        .from(BUCKET_NAME)
        .upload(filePath, content, {
          contentType,
          upsert: true,
        });

      if (error) {
        console.error(`Failed to upload ${fileName}:`, error);
        return null;
      }

      return filePath;
    } catch (error) {
      console.error(`Error uploading ${fileName}:`, error);
      return null;
    }
  };

  if (data.markdown) {
    const path = await uploadFile('design.md', data.markdown, 'text/markdown');
    if (path) exportPaths.design = path;
  }

  if (data.diagramJson) {
    const path = await uploadFile('diagram.json', data.diagramJson, 'application/json');
    if (path) exportPaths.diagram = path;
  }

  if (data.contextJson) {
    const path = await uploadFile('context.json', data.contextJson, 'application/json');
    if (path) exportPaths.context = path;
  }

  if (data.script) {
    const path = await uploadFile('script.txt', data.script, 'text/plain');
    if (path) exportPaths.script = path;
  }

  return exportPaths;
}

export async function getExportUrl(jobId: string, fileName: keyof ExportPaths): Promise<string | null> {
  const supabase = await createClient();
  
  const { data: job, error } = await supabase
    .from('jobs')
    .select('export_paths')
    .eq('id', jobId)
    .single();

  if (error || !job?.export_paths?.[fileName]) {
    return null;
  }

  const filePath = job.export_paths[fileName];
  
  const { data: { publicUrl } } = supabase
    .storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  return publicUrl;
}

export async function listExportedFiles(jobId: string): Promise<ExportPaths | null> {
  const supabase = await createClient();
  
  const { data: job, error } = await supabase
    .from('jobs')
    .select('export_paths')
    .eq('id', jobId)
    .single();

  if (error || !job?.export_paths) {
    return null;
  }

  return job.export_paths as ExportPaths;
}

export async function deleteExportedFiles(jobId: string): Promise<void> {
  const supabase = await createClient();
  
  const exportPaths = await listExportedFiles(jobId);
  if (!exportPaths) return;

  const filesToDelete = Object.values(exportPaths).filter(Boolean);
  
  if (filesToDelete.length > 0) {
    await supabase
      .storage
      .from(BUCKET_NAME)
      .remove(filesToDelete as string[]);
  }
}
