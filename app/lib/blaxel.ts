import { SandboxInstance } from '@blaxel/core';

export async function createAnalysisSandbox(sandboxName: string) {
  const region = process.env.BL_REGION || 'us-pdx-1';
  
  return SandboxInstance.create({
    name: sandboxName,
    image: 'blaxel/base-image:latest',
    memory: 4096,
    region,
  });
}

export async function destroySandbox(sandbox: SandboxInstance) {
  await sandbox.delete();
}
