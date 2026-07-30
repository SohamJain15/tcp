import { CAdapter } from "./adapters/c.adapter";
import { CppAdapter } from "./adapters/cpp.adapter";
import { GoAdapter } from "./adapters/go.adapter";
import { JavaAdapter } from "./adapters/java.adapter";
import { JavaScriptAdapter } from "./adapters/javascript.adapter";
import { KotlinAdapter } from "./adapters/kotlin.adapter";
import { PythonAdapter } from "./adapters/python.adapter";
import { RustAdapter } from "./adapters/rust.adapter";
import { TypeScriptAdapter } from "./adapters/typescript.adapter";
import { harnessRegistry, HarnessRegistry } from "./registry";
import { BinaryTreeSerializer } from "./serializers/tree-serializer";
import { GraphSerializer } from "./serializers/graph-serializer";
import { JsonValueSerializer } from "./serializers/json-serializer";
import { LinkedListSerializer } from "./serializers/linked-list-serializer";

let registered = false;

/**
 * Populate a registry with the built-in serializer plugins and language adapters.
 * Order matters only for precedence: JSON is registered first so the object-graph
 * plugins (registered after) take precedence for their specific types.
 */
export function registerHarness(registry: HarnessRegistry = harnessRegistry): HarnessRegistry {
  registry
    .registerSerializer(new JsonValueSerializer())
    .registerSerializer(new BinaryTreeSerializer())
    .registerSerializer(new LinkedListSerializer())
    .registerSerializer(new GraphSerializer());

  registry
    .registerAdapter(new PythonAdapter())
    .registerAdapter(new JavaScriptAdapter("javascript"))
    .registerAdapter(new JavaScriptAdapter("vanilla"))
    .registerAdapter(new TypeScriptAdapter())
    .registerAdapter(new JavaAdapter())
    .registerAdapter(new CppAdapter("cpp"))
    .registerAdapter(new CAdapter())
    .registerAdapter(new GoAdapter())
    .registerAdapter(new RustAdapter())
    .registerAdapter(new KotlinAdapter());

  return registry;
}

/** Idempotent registration of the process-wide singleton (safe to call repeatedly). */
export function ensureHarnessRegistered(): void {
  if (registered) {
    return;
  }
  registerHarness(harnessRegistry);
  registered = true;
}
