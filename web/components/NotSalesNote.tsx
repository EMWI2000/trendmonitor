/** The sentence that must sit next to every sold-out number: udsolgt er ikke salg. */
export default function NotSalesNote({ text, extra }: { text: string; extra?: string }) {
  return (
    <p className="flex items-start gap-2 text-sm text-ink2">
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-axis text-[10px] font-semibold text-ink2"
      >
        i
      </span>
      <span>
        {text}
        {extra ? ` ${extra}` : ""}
      </span>
    </p>
  );
}
