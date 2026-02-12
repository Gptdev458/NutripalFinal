[
  {
    "event_message": "shutdown",
    "event_type": "Shutdown",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "047ac85a-5ff4-41e1-862e-233d425e556f",
    "level": "log",
    "timestamp": 1770917117504000
  },
  {
    "event_message": "shutdown",
    "event_type": "Shutdown",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "40a1c87c-ca1e-4f50-9095-dd5fa9fe3988",
    "level": "log",
    "timestamp": 1770917117278000
  },
  {
    "event_message": "[OrchestratorV3] Static fast-path: button confirm (Action: food_log)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "f7db5fab-a55e-449b-b10c-2983e4d4e6b8",
    "level": "info",
    "timestamp": 1770917107929000
  },
  {
    "event_message": "[ThoughtLogger] Processing your confirmation...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "9299d118-0494-419f-ae3f-7782e5135e5d",
    "level": "info",
    "timestamp": 1770917107929000
  },
  {
    "event_message": "[Chat-Handler] Streaming step: Processing your confirmation...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "f8f70a90-f1bc-45e0-b0a6-a9639008ce7a",
    "level": "info",
    "timestamp": 1770917107929000
  },
  {
    "event_message": "[Chat-Handler] User: aa9fdbea-c0d9-4bb5-b2a8-5ea49386aac9 Session: bba87d5e-e706-4e08-8fbd-426964235ecf Message: Confirm\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "5c0e9ad2-a66e-4ae5-8a53-7cd13035291e",
    "level": "info",
    "timestamp": 1770917107539000
  },
  {
    "event_message": "[Chat-Handler] Request received (v3.0.0 - Hybrid Multi-Agent)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "25667360-48bc-4e4b-ad97-dd9d25dc25ce",
    "level": "info",
    "timestamp": 1770917107410000
  },
  {
    "event_message": "Listening on http://localhost:9999/\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "33e3319d-26ee-4ffd-8c12-03e20e619bc3",
    "level": "info",
    "timestamp": 1770917107408000
  },
  {
    "event_message": "booted (time: 36ms)",
    "event_type": "Boot",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "eb133fe9-98e7-4b75-bca7-23bdbf05c319",
    "level": "log",
    "timestamp": 1770917107406000
  },
  {
    "event_message": "Listening on http://localhost:9999/\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "b7747121-c9bd-468d-b110-fe1d3b0d44fe",
    "level": "info",
    "timestamp": 1770917107213000
  },
  {
    "event_message": "booted (time: 37ms)",
    "event_type": "Boot",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "099df733-a72e-4117-b83f-e8fd4a7d6835",
    "level": "log",
    "timestamp": 1770917107211000
  },
  {
    "event_message": "[ToolExecutor] Executing tool: propose_food_log {\n  food_name: \"avocado\",\n  portion: \"one medium\",\n  calories: 234,\n  source: \"agent\",\n  confidence: \"medium\",\n  confidence_details: {\n    calories: \"medium\",\n    protein_g: \"medium\",\n    carbs_g: \"medium\",\n    fat_total_g: \"medium\"\n  },\n  error_sources: [ \"Estimation based on typical size of a medium avocado (~150g).\" ],\n  health_flags: [],\n  applied_memory: null,\n  fat_total_g: 21,\n  carbs_g: 12,\n  fiber_g: 10,\n  sugar_g: 1,\n  protein_g: 3\n}\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "4b94f967-3ebc-4c7e-847a-6680240dd5f6",
    "level": "info",
    "timestamp": 1770917103333000
  },
  {
    "event_message": "[NutritionAgent] Rule-based scaling: one medium / one medium = 1\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "459c5b71-afbb-403f-8121-572935a84ba1",
    "level": "info",
    "timestamp": 1770917103332000
  },
  {
    "event_message": "[NutritionAgent] LLM Response: {\n  \"food_name\": \"avocado\",\n  \"calories\": 234,\n  \"protein_g\": 3,\n  \"carbs_g\": 12,\n  \"fat_total_g\": 21,\n  \"fiber_g\": 10,\n  \"sugar_g\": 1,\n  \"sodium_mg\": 10,\n  \"fat_saturated_g\": 3,\n  \"cholesterol_mg\": 0,\n  \"potassium_mg\": 708,\n  \"calcium_mg\": 18,\n  \"iron_mg\": 1,\n  \"magnesium_mg\": 39,\n  \"vitamin_a_mcg\": 7,\n  \"vitamin_c_mg\": 15,\n  \"vitamin_d_mcg\": 0,\n  \"serving_size\": \"one medium\",\n  \"confidence\": \"medium\",\n  \"confidence_details\": {\n    \"calories\": \"medium\",\n    \"protein_g\": \"medium\",\n    \"carbs_g\": \"medium\",\n    \"fat_total_g\": \"medium\"\n  },\n  \"error_sources\": [\"Estimation based on typical size of a medium avocado (~150g).\"],\n  \"health_flags\": []\n}\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "6166e866-abbd-41db-a94f-eefd5d3ffc38",
    "level": "info",
    "timestamp": 1770917103332000
  },
  {
    "event_message": "[NutritionAgent] Estimating for: \"avocado\" (Portion: one medium)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "ed2103a6-260a-4b04-931d-7e33e53efaaf",
    "level": "info",
    "timestamp": 1770917097202000
  },
  {
    "event_message": "[NutritionAgent] No data from API/Cache for \"avocado\", trying LLM estimation\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "1ef47bf3-cb1a-4462-80fb-377474cc911d",
    "level": "info",
    "timestamp": 1770917097202000
  },
  {
    "event_message": "[NutritionAgent] FAILED LOOKUP: \"avocado\" - API returned no data and no fallback found (attempt 1)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "44fd7e13-4da3-417b-ad84-5876ded65821",
    "level": "warning",
    "timestamp": 1770917097121000
  },
  {
    "event_message": "[NutritionAgent] Cache miss for avocado, calling APIs\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "e072b4c1-f630-4570-beae-ef8aaa5a81e4",
    "level": "info",
    "timestamp": 1770917097120000
  },
  {
    "event_message": "[NutritionLookup] Lookup requested for: avocado\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "11914381-e722-484d-96bf-61aa2ee89312",
    "level": "info",
    "timestamp": 1770917097120000
  },
  {
    "event_message": "[ToolExecutor] lookupNutrition for: avocado\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "ba57b89f-d0b1-4c7a-b71a-a56b107bebe3",
    "level": "info",
    "timestamp": 1770917096960000
  },
  {
    "event_message": "[ToolExecutor] Executing tool: lookup_nutrition {\n  food: \"avocado\",\n  portion: \"one medium\",\n  calories: null,\n  macros: { protein: null, carbs: null, fat: null }\n}\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "10df8ca7-83f9-4dd7-bbb0-3743d8e3b1aa",
    "level": "info",
    "timestamp": 1770917096959000
  },
  {
    "event_message": "[Chat-Handler] Streaming step: Looking up nutrition...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "43d7a3a9-6336-4ed1-b845-9ed6614001af",
    "level": "info",
    "timestamp": 1770917096958000
  },
  {
    "event_message": "[ThoughtLogger] Looking up nutrition...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "c7a6e29f-b7bd-4b87-a17f-073bba1e1695",
    "level": "info",
    "timestamp": 1770917096958000
  },
  {
    "event_message": "[OrchestratorV3] Branch: simple_log_food\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "1be1d8e9-ee9f-49bc-b571-4239d19189b7",
    "level": "info",
    "timestamp": 1770917096958000
  },
  {
    "event_message": "[RecipeAgent] Searching for recipe: \"avocado\" (Fingerprint provided: false)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "9aa52c2e-d55b-4fc7-974e-1944b2257e49",
    "level": "info",
    "timestamp": 1770917096717000
  },
  {
    "event_message": "[OrchestratorV3] Checking for saved recipes matching \"avocado\"...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "7d7027a0-5d47-4f9f-8230-4a6d107f67f0",
    "level": "info",
    "timestamp": 1770917096716000
  },
  {
    "event_message": "[OrchestratorV3] Intent: log_food (Confidence: N/A)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "f0667f6b-0246-4f11-9e11-44434e30fd53",
    "level": "info",
    "timestamp": 1770917096634000
  },
  {
    "event_message": "[Chat-Handler] Streaming step: Analyzing intent...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "6d0a7cf5-fb12-40e4-8377-768f0a5ea181",
    "level": "info",
    "timestamp": 1770917092508000
  },
  {
    "event_message": "[ThoughtLogger] Analyzing intent...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "f3c320ff-3bdf-464d-8f00-8aa167985d92",
    "level": "info",
    "timestamp": 1770917092508000
  },
  {
    "event_message": "[Chat-Handler] User: aa9fdbea-c0d9-4bb5-b2a8-5ea49386aac9 Session: bba87d5e-e706-4e08-8fbd-426964235ecf Message: log one medium fresh avacado\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "0e6203c9-e034-478d-9d84-e45ce1712643",
    "level": "info",
    "timestamp": 1770917091565000
  },
  {
    "event_message": "[Chat-Handler] Request received (v3.0.0 - Hybrid Multi-Agent)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "a7c7f1ac-108d-4b04-8930-1e99c4b01690",
    "level": "info",
    "timestamp": 1770917091474000
  },
  {
    "event_message": "Listening on http://localhost:9999/\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "af1b12b2-70aa-40ff-b309-7254a2cc2396",
    "level": "info",
    "timestamp": 1770917091473000
  },
  {
    "event_message": "booted (time: 36ms)",
    "event_type": "Boot",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "3396679c-69e2-4755-9cbe-59f47da19751",
    "level": "log",
    "timestamp": 1770917091471000
  },
  {
    "event_message": "Listening on http://localhost:9999/\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "a702397a-77c2-4954-9478-ad523b0f882b",
    "level": "info",
    "timestamp": 1770917091288000
  },
  {
    "event_message": "booted (time: 38ms)",
    "event_type": "Boot",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "90fb3266-0812-425f-a074-d81701097345",
    "level": "log",
    "timestamp": 1770917091286000
  },
  {
    "event_message": "shutdown",
    "event_type": "Shutdown",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "b4a1f31d-bd08-4de6-a513-561c769f2824",
    "level": "log",
    "timestamp": 1770917089368000
  },
  {
    "event_message": "shutdown",
    "event_type": "Shutdown",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "050a0531-73a7-471b-8f5b-2e7445604ab0",
    "level": "log",
    "timestamp": 1770917089215000
  },
  {
    "event_message": "[ThoughtLogger] Processing your confirmation...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "52c87ac1-9740-42d4-b4f9-731c87750f50",
    "level": "info",
    "timestamp": 1770917072058000
  },
  {
    "event_message": "[OrchestratorV3] Static fast-path: button confirm (Action: food_log)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "c9fd3301-7601-4146-a411-09828ebd7df8",
    "level": "info",
    "timestamp": 1770917072058000
  },
  {
    "event_message": "[Chat-Handler] Streaming step: Processing your confirmation...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "46d3f68c-f436-465a-b110-c7df9bc49ed2",
    "level": "info",
    "timestamp": 1770917072058000
  },
  {
    "event_message": "[Chat-Handler] User: aa9fdbea-c0d9-4bb5-b2a8-5ea49386aac9 Session: bba87d5e-e706-4e08-8fbd-426964235ecf Message: Confirm\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "5aade988-34b1-4d8c-8472-14753311819e",
    "level": "info",
    "timestamp": 1770917071547000
  },
  {
    "event_message": "[Chat-Handler] Request received (v3.0.0 - Hybrid Multi-Agent)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "0c5cb485-39e7-4575-be3d-44662a131b9e",
    "level": "info",
    "timestamp": 1770917071230000
  },
  {
    "event_message": "Listening on http://localhost:9999/\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "5e905082-40b1-4215-916e-47ed7af5e083",
    "level": "info",
    "timestamp": 1770917071228000
  },
  {
    "event_message": "booted (time: 40ms)",
    "event_type": "Boot",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "dd1b52aa-c912-477f-8591-aaeee51616a3",
    "level": "log",
    "timestamp": 1770917071226000
  },
  {
    "event_message": "Listening on http://localhost:9999/\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "5fb5983c-2a2c-4d76-9217-f7cbc68e9c97",
    "level": "info",
    "timestamp": 1770917071050000
  },
  {
    "event_message": "booted (time: 36ms)",
    "event_type": "Boot",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "20a272a8-ac7a-4973-816f-421f0ed5d726",
    "level": "log",
    "timestamp": 1770917071048000
  },
  {
    "event_message": "[NutritionAgent] Rule-based scaling: 1 serving / 1 serving = 1\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "d54d8617-39ae-4de0-b43b-1993acca4d44",
    "level": "info",
    "timestamp": 1770917051295000
  },
  {
    "event_message": "[ToolExecutor] Executing tool: propose_food_log {\n  food_name: \"Whole Foods 365 Homestyle Waffle\",\n  portion: \"1 serving\",\n  calories: 210,\n  source: \"agent\",\n  confidence: \"medium\",\n  confidence_details: {\n    calories: \"medium\",\n    protein_g: \"medium\",\n    carbs_g: \"medium\",\n    fat_total_g: \"medium\"\n  },\n  error_sources: [\n    \"Nutrition data estimated from general product information, not exact brand-specific data.\"\n  ],\n  health_flags: [ \"processed_food\", \"contains_sugar\" ],\n  applied_memory: null,\n  fat_total_g: 8,\n  carbs_g: 28,\n  fiber_g: 2,\n  sugar_g: 5,\n  protein_g: 5\n}\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "9851270a-23e2-452e-94e9-961f75899b8d",
    "level": "info",
    "timestamp": 1770917051295000
  },
  {
    "event_message": "[NutritionAgent] LLM Response: {\n  \"food_name\": \"Whole Foods 365 Homestyle Waffle\",\n  \"calories\": 210,\n  \"protein_g\": 5,\n  \"carbs_g\": 28,\n  \"fat_total_g\": 8,\n  \"fiber_g\": 2,\n  \"sugar_g\": 5,\n  \"sodium_mg\": 420,\n  \"fat_saturated_g\": 1,\n  \"cholesterol_mg\": 0,\n  \"potassium_mg\": 65,\n  \"calcium_mg\": 150,\n  \"iron_mg\": 1.8,\n  \"magnesium_mg\": 10,\n  \"vitamin_a_mcg\": 0,\n  \"vitamin_c_mg\": 0,\n  \"vitamin_d_mcg\": 0,\n  \"serving_size\": \"1 serving\",\n  \"confidence\": \"medium\",\n  \"confidence_details\": {\n    \"calories\": \"medium\",\n    \"protein_g\": \"medium\",\n    \"carbs_g\": \"medium\",\n    \"fat_total_g\": \"medium\"\n  },\n  \"error_sources\": [\"Nutrition data estimated from general product information, not exact brand-specific data.\"],\n  \"health_flags\": [\"processed_food\", \"contains_sugar\"]\n}\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "5aada4a5-9746-4ccf-b856-3e9f0cf6f3e2",
    "level": "info",
    "timestamp": 1770917051294000
  },
  {
    "event_message": "shutdown",
    "event_type": "Shutdown",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "67897847-17bd-4f49-9143-1c8939cb6952",
    "level": "log",
    "timestamp": 1770917049608000
  },
  {
    "event_message": "shutdown",
    "event_type": "Shutdown",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "dca5e7bf-5883-4331-b1ad-7af031e96eba",
    "level": "log",
    "timestamp": 1770917049465000
  },
  {
    "event_message": "[NutritionAgent] Estimating for: \"Whole Foods 365 Homestyle Waffle\" (Portion: 1 serving)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "0f0966ba-a15e-440a-bb8f-fe7032139b71",
    "level": "info",
    "timestamp": 1770917048466000
  },
  {
    "event_message": "[NutritionAgent] No data from API/Cache for \"Whole Foods 365 Homestyle Waffle\", trying LLM estimation\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "52085915-5fb9-49e2-b169-7f9683987883",
    "level": "info",
    "timestamp": 1770917048466000
  },
  {
    "event_message": "[NutritionAgent] FAILED LOOKUP: \"Whole Foods 365 Homestyle Waffle\" - API returned no data and no fallback found (attempt 1)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "d73c33a6-d627-4037-a4ad-2c0cceacf997",
    "level": "warning",
    "timestamp": 1770917048378000
  },
  {
    "event_message": "[NutritionLookup] Lookup requested for: Whole Foods 365 Homestyle Waffle\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "3b9f97dc-4991-47de-a917-049c46bf46cf",
    "level": "info",
    "timestamp": 1770917048377000
  },
  {
    "event_message": "[NutritionAgent] Cache miss for Whole Foods 365 Homestyle Waffle, calling APIs\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "eacc62a0-4c3f-434d-94a8-0a3955a969dd",
    "level": "info",
    "timestamp": 1770917048377000
  },
  {
    "event_message": "[ToolExecutor] lookupNutrition for: Whole Foods 365 Homestyle Waffle\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "6d582235-b5a1-4268-8ef6-9e072fd32ddb",
    "level": "info",
    "timestamp": 1770917048184000
  },
  {
    "event_message": "[ToolExecutor] Executing tool: lookup_nutrition {\n  food: \"Whole Foods 365 Homestyle Waffle\",\n  portion: \"1 serving\",\n  calories: null,\n  macros: { protein: null, carbs: null, fat: null }\n}\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "8c474f01-c0e1-44c3-89ca-262ce22eb09d",
    "level": "info",
    "timestamp": 1770917048183000
  },
  {
    "event_message": "[OrchestratorV3] Branch: simple_log_food\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "dd649fea-08fb-431d-887b-f11b042b9644",
    "level": "info",
    "timestamp": 1770917048182000
  },
  {
    "event_message": "[ThoughtLogger] Looking up nutrition...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "ce29f764-d293-4a2c-9b35-3726da25e0c1",
    "level": "info",
    "timestamp": 1770917048182000
  },
  {
    "event_message": "[Chat-Handler] Streaming step: Looking up nutrition...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "a99c91bb-2a78-44aa-8b3f-20be73a3c1c7",
    "level": "info",
    "timestamp": 1770917048182000
  },
  {
    "event_message": "[OrchestratorV3] Checking for saved recipes matching \"Whole Foods 365 Homestyle Waffle\"...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "909dece3-a848-46d8-95a6-b9f8d3e1289b",
    "level": "info",
    "timestamp": 1770917047920000
  },
  {
    "event_message": "[RecipeAgent] Searching for recipe: \"Whole Foods 365 Homestyle Waffle\" (Fingerprint provided: false)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "27f2ffa1-8d5b-4c84-a026-58677ac3bcd5",
    "level": "info",
    "timestamp": 1770917047920000
  },
  {
    "event_message": "[OrchestratorV3] Intent: log_food (Confidence: N/A)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "d26fced5-ca5a-4642-a132-b6ef952bc08c",
    "level": "info",
    "timestamp": 1770917047773000
  },
  {
    "event_message": "[ThoughtLogger] Analyzing intent...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "a2b3313a-57bf-48e0-94ab-3dd45cfa4660",
    "level": "info",
    "timestamp": 1770917043090000
  },
  {
    "event_message": "[Chat-Handler] Streaming step: Analyzing intent...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "5ff4521d-9123-4769-a6c1-c09270e9fe28",
    "level": "info",
    "timestamp": 1770917043090000
  },
  {
    "event_message": "[Chat-Handler] User: aa9fdbea-c0d9-4bb5-b2a8-5ea49386aac9 Session: bba87d5e-e706-4e08-8fbd-426964235ecf Message: Log a Whole Foods 365 Homestyle Waffle\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "ac1022df-00e7-4a76-9d78-debc0e84fbcd",
    "level": "info",
    "timestamp": 1770917042647000
  },
  {
    "event_message": "[Chat-Handler] Request received (v3.0.0 - Hybrid Multi-Agent)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "aaebb3f5-13e7-48c7-9549-e706801437b3",
    "level": "info",
    "timestamp": 1770917042489000
  },
  {
    "event_message": "Listening on http://localhost:9999/\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "14275d78-44d5-418b-a114-56db2afa5dfe",
    "level": "info",
    "timestamp": 1770917042487000
  },
  {
    "event_message": "booted (time: 44ms)",
    "event_type": "Boot",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "f46c7b9c-b50e-4c2c-8031-766953956930",
    "level": "log",
    "timestamp": 1770917042485000
  },
  {
    "event_message": "Listening on http://localhost:9999/\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "0090a6f3-264d-47c6-b1c7-eb418fbb0068",
    "level": "info",
    "timestamp": 1770917042262000
  },
  {
    "event_message": "booted (time: 37ms)",
    "event_type": "Boot",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "5d737dda-8624-4726-aca9-e1104b4d38f8",
    "level": "log",
    "timestamp": 1770917042260000
  },
  {
    "event_message": "shutdown",
    "event_type": "Shutdown",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "cf48567e-b18e-4521-a1f1-d77ff195c5b4",
    "level": "log",
    "timestamp": 1770917023844000
  },
  {
    "event_message": "shutdown",
    "event_type": "Shutdown",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "57b3b7c3-60e5-4aae-b43b-faf214006ea1",
    "level": "log",
    "timestamp": 1770917023664000
  },
  {
    "event_message": "[InsightAgent] Executing classify_day with query: \"food choices while traveling\" { days: 7, start: \"2023-10-01\", end: \"2023-10-07\" }\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "a183c5d5-9ef0-4cbc-9019-bfc1fd42bc20",
    "level": "info",
    "timestamp": 1770917019354000
  },
  {
    "event_message": "[ThoughtLogger] Analyzing your data...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "b488cd49-0957-4f5f-ad8a-3b11cd810fa0",
    "level": "info",
    "timestamp": 1770917019352000
  },
  {
    "event_message": "[OrchestratorV3] Branch: classify_day (Direct Route to InsightAgent)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "557f3e03-836c-4c83-9638-df165e90e217",
    "level": "info",
    "timestamp": 1770917019352000
  },
  {
    "event_message": "[Chat-Handler] Streaming step: Analyzing your data...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "044639a7-9e0d-411c-b464-c8aa4c2b2b19",
    "level": "info",
    "timestamp": 1770917019352000
  },
  {
    "event_message": "[OrchestratorV3] Intent: classify_day (Confidence: N/A)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "965efc6b-3c75-4551-b345-53a112a63e65",
    "level": "info",
    "timestamp": 1770917019352000
  },
  {
    "event_message": "[Chat-Handler] Streaming step: Analyzing intent...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "e9ecadc4-3545-40d4-bc40-14b919072d54",
    "level": "info",
    "timestamp": 1770917015086000
  },
  {
    "event_message": "[ThoughtLogger] Analyzing intent...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "a828fe0c-ed8e-403e-8c1f-9572ebd5759e",
    "level": "info",
    "timestamp": 1770917015086000
  },
  {
    "event_message": "[Chat-Handler] User: aa9fdbea-c0d9-4bb5-b2a8-5ea49386aac9 Session: bba87d5e-e706-4e08-8fbd-426964235ecf Message: I'm traveling today, so food choices are limited.\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "cd1c6d37-7cb4-446f-8e91-fbf33cefbac7",
    "level": "info",
    "timestamp": 1770917014501000
  },
  {
    "event_message": "[Chat-Handler] Request received (v3.0.0 - Hybrid Multi-Agent)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "85b4f946-df6c-4c2d-b991-936b92dbdbab",
    "level": "info",
    "timestamp": 1770917014359000
  },
  {
    "event_message": "Listening on http://localhost:9999/\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "8fed41e8-49af-445e-bd36-c11c3cc778f1",
    "level": "info",
    "timestamp": 1770917014357000
  },
  {
    "event_message": "booted (time: 30ms)",
    "event_type": "Boot",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "986bb1c7-d6d6-4287-b07b-f2754879ba6d",
    "level": "log",
    "timestamp": 1770917014356000
  },
  {
    "event_message": "Listening on http://localhost:9999/\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "f646cdb7-f73f-480c-a824-06bf5225c831",
    "level": "info",
    "timestamp": 1770917014198000
  },
  {
    "event_message": "booted (time: 38ms)",
    "event_type": "Boot",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "f2be9dbd-b2b9-415b-86a8-93ba81d4089f",
    "level": "log",
    "timestamp": 1770917014197000
  },
  {
    "event_message": "shutdown",
    "event_type": "Shutdown",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "8b2ec13e-5967-4594-b84c-560bdfbf3902",
    "level": "log",
    "timestamp": 1770916992682000
  },
  {
    "event_message": "shutdown",
    "event_type": "Shutdown",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "f0f3a27e-fb4a-42a9-8ae3-08cb4e1c7c3a",
    "level": "log",
    "timestamp": 1770916980707000
  },
  {
    "event_message": "shutdown",
    "event_type": "Shutdown",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "c17bf204-d337-4339-a9fb-11626c1e03be",
    "level": "log",
    "timestamp": 1770916980523000
  },
  {
    "event_message": "[InsightAgent] Executing summary with query: \"weekly performance\" { days: 7, start: \"2023-10-01\", end: \"2023-10-07\" }\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "b0f5f917-65c0-4ca5-9d43-9da6178a6664",
    "level": "info",
    "timestamp": 1770916979640000
  },
  {
    "event_message": "[OrchestratorV3] Branch: summary (Direct Route to InsightAgent)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "f598a556-b436-4349-9aba-aa4d03abe2fc",
    "level": "info",
    "timestamp": 1770916979638000
  },
  {
    "event_message": "[ThoughtLogger] Analyzing your data...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "2c22a862-17af-49d5-8a5f-017f4b0a4ad6",
    "level": "info",
    "timestamp": 1770916979638000
  },
  {
    "event_message": "[OrchestratorV3] Intent: summary (Confidence: N/A)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "058e827e-2965-46f0-916f-c75b97687ef6",
    "level": "info",
    "timestamp": 1770916979638000
  },
  {
    "event_message": "[Chat-Handler] Streaming step: Analyzing your data...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "815831ab-0302-40d5-ae44-47eb723178c8",
    "level": "info",
    "timestamp": 1770916979638000
  },
  {
    "event_message": "[Chat-Handler] Streaming step: Analyzing intent...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "b8d24e86-4ca6-4b6f-8b7a-510887b158f4",
    "level": "info",
    "timestamp": 1770916975099000
  },
  {
    "event_message": "[ThoughtLogger] Analyzing intent...\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "005ef1c2-e4f1-4553-83d2-ea6dcf3ca600",
    "level": "info",
    "timestamp": 1770916975099000
  },
  {
    "event_message": "[Chat-Handler] User: aa9fdbea-c0d9-4bb5-b2a8-5ea49386aac9 Session: bba87d5e-e706-4e08-8fbd-426964235ecf Message: how am i doing this week?\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "b1fe8aac-3632-461f-afe5-77063434ddb9",
    "level": "info",
    "timestamp": 1770916974704000
  },
  {
    "event_message": "[Chat-Handler] Request received (v3.0.0 - Hybrid Multi-Agent)\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "ea38031f-6e46-4361-b6c8-8185ca00edde",
    "level": "info",
    "timestamp": 1770916974599000
  },
  {
    "event_message": "Listening on http://localhost:9999/\n",
    "event_type": "Log",
    "function_id": "d25c7fd2-52f9-4754-8e63-5f4afaf36e3c",
    "id": "29d24cd7-56ec-415e-b51e-07ca6cf9fdb9",
    "level": "info",
    "timestamp": 1770916974597000
  }
]