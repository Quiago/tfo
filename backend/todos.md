  ⚠️  Por implementar cuando sea necesario (no ahora)

  ┌──────────────────────────────────┬───────────────────────────────────────────────────────────────────────────┐
  │      Recomendación de Kimi       │                              Cuándo hacerlo                               │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
  │ Perfiles YAML por vendor         │ Cuando tengas un cliente Siemens específico con estructura conocida       │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
  │ Detección de FolderType          │ La estructura ya lo resuelve: un FolderType sin Variables directas no se  │
  │ (ns=0;i=61)                      │ añade como asset                                                          │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
  │ TypeDefinition por nodo          │ Cuando necesites filtrar por DeviceType del DI spec (Siemens S7, etc.)    │
  ├──────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
  │ Estrategias                      │ Ya tienes discovery_max_nodes y discovery_timeout_s en backend_config —   │
  │ FAST/STANDARD/COMPLETE           │ suficiente                                                                │
  └──────────────────────────────────┴───────────────────────────────────────────────────────────────────────────┘
