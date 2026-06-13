import { Controller, OnModuleInit, Logger } from '@nestjs/common';

@Controller()
export class FilesMessageController implements OnModuleInit {
  private readonly logger = new Logger(FilesMessageController.name);

  onModuleInit(): void {
    // Short startup log to confirm that message controller is present
    this.logger.log(
      '[RABBIT] consumer registered queue=files_queue exchange=common_exchange routingKey=post.deleted',
    );
  }
}
