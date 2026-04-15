import type { RankedItem } from '../../services/admin/AnalyticsService';
import HorizontalBarChart from './HorizontalBarChart';

interface Props {
    data: RankedItem[];
}

export default function MarketRankingChart({ data }: Props) {
    return (
        <HorizontalBarChart
            title="Mercados mais consultados"
            badge="por volume de eventos"
            data={data}
            color="#136b5f"
            emptyMessage="Nenhum mercado identificado nos eventos ainda."
        />
    );
}
