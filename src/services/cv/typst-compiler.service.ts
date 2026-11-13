import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

@Injectable()
export class TypstCompilerService {
  private readonly logger = new Logger(TypstCompilerService.name);

  /**
   * Resolves the path to the `typst` binary on the host or container.
   */
  resolveTypstBinary(): string {
    if (process.env.TYPST_BIN && fs.existsSync(process.env.TYPST_BIN)) {
      return process.env.TYPST_BIN;
    }

    const homeDir = os.homedir();
    const candidateBins = [
      path.join(homeDir, '.local', 'bin', 'typst'),
      '/usr/local/bin/typst',
      '/usr/bin/typst',
    ];

    for (const candidate of candidateBins) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return 'typst';
  }

  /**
   * Compiles a Typst (.typ) source string into a PDF Buffer and cleans up temporary files.
   */
  async compileToPdfBuffer(typstSource: string): Promise<Buffer> {
    const tempId = randomUUID();
    const tmpDir = os.tmpdir();
    const inputTypPath = path.join(tmpDir, `cv-${tempId}.typ`);
    const outputPdfPath = path.join(tmpDir, `cv-${tempId}.pdf`);

    try {
      await fs.promises.writeFile(inputTypPath, typstSource, 'utf8');

      const typstBin = this.resolveTypstBinary();
      await execFileAsync(typstBin, ['compile', inputTypPath, outputPdfPath], {
        timeout: 15000,
      });

      const pdfBuffer = await fs.promises.readFile(outputPdfPath);
      this.logger.log(
        `📄 Currículo compilado com sucesso via Typst (${(pdfBuffer.length / 1024).toFixed(1)} KB).`,
      );
      return pdfBuffer;
    } finally {
      await fs.promises.unlink(inputTypPath).catch(() => undefined);
      await fs.promises.unlink(outputPdfPath).catch(() => undefined);
    }
  }
}
