import type { TextoSaldo } from "@/lib/tipos";

/** El resultado del saldo en tres partes cortas: qué pasó, qué significa y qué hacer. */
export function TextoSaldoTres({ saldo }: { saldo: TextoSaldo }) {
  const partes: [string, string][] = [
    ["Qué pasó", saldo.queSePaso],
    ["Qué significa", saldo.queSignifica],
    ["Qué hacer", saldo.queHacer],
  ];
  return (
    <dl className="mt-1 space-y-0.5 text-sm">
      {partes.map(([t, v]) => (
        <div key={t} className="sm:flex sm:gap-2">
          <dt className="font-semibold sm:w-28 sm:flex-none">{t}</dt>
          <dd className="text-suave">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
