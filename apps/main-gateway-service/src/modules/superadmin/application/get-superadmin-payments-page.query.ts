import { Injectable } from '@nestjs/common';
import { SuperadminPaymentsPageReader } from '../domain/superadmin-payments-page.port';
import { EnrichSuperadminPaymentsPageQuery } from './enrich-superadmin-payments-page';
import { normalizeSuperadminPaymentsFilter } from '../../../../../../libs/common/src/validation/normalize-superadmin-payments-filter';
import type {
  SuperadminPaymentsInput,
  EnrichedSuperadminPaymentsPage,
} from '../../../../../../libs/common/types/superadmin-payments-list';
@Injectable()
export class GetSuperadminPaymentsPageQuery {
  constructor(
    private readonly reader: SuperadminPaymentsPageReader,
    private readonly enrichment: EnrichSuperadminPaymentsPageQuery,
  ) {}
  async execute(input: SuperadminPaymentsInput): Promise<EnrichedSuperadminPaymentsPage> {
    const filter = normalizeSuperadminPaymentsFilter(input);
    return this.enrichment.execute(await this.reader.findPage(filter));
  }
}
