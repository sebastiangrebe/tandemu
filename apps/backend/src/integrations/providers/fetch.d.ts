// Node 20+ includes a built-in global fetch API.
// This declaration makes TypeScript aware of it without pulling in DOM types.
declare function fetch(input: string | URL, init?: RequestInit): Promise<Response>;

interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface Response {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
