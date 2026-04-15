import type { RankedItem } from '../../services/admin/AnalyticsService';
import HorizontalBarChart from './HorizontalBarChart';

interface Props {
    data: RankedItem[];
}

export default function RegionConsumptionMap({ data }: Props) {
    return (
        <HorizontalBarChart
            title="Regiões com maior consumo"
            badge="compras por bairro/região"
            data={data}
            color="#0a5a50"
            emptyMessage="Nenhuma região identificada ainda. Dados aparecem quando usuários compartilham bairro."
        />
    );
}
