// interpreter.js

/**
 * Helper to process fields into a concatenated string (name=example, ...)
 * @param {Array<Object>} fields - The fields array from a Command, Event, or ReadModel.
 * @returns {string} Formatted string of fields.
 */
const formatFields = (fields) => {
    if (!fields || fields.length === 0) return '(none)';
    return fields.map(field => {
        // Ensure field exists and has a name before trying to access example
        const name = field && field.name ? String(field.name) : '';
        if (!name) return '';
        
        // Use example if available, converting it to a string and removing quotes, otherwise use empty string
        const value = field.example !== undefined && field.example !== null 
            ? String(field.example).replace(/"/g, '') 
            : '';
            
        return `${name}=${value}`;
    }).filter(s => s.length > 0).join(', '); // Filter out any empty strings from malformed fields
};

// -----------------------------------------------------------------------------

/**
 * Processes the 'examples' array for BDD Read Model steps (list results) or any list data.
 * @param {Array<Object>} examples - The examples array containing lists of result objects.
 * @returns {string} Formatted string of example lists: (field=value, ...); (field=value, ...)
 */
const formatReadModelExamples = (examples) => {
    if (!examples || examples.length === 0) return '(none)';
    
    // Convert each example object into a "field=value, field2=value" string
    const formattedExamples = examples.map(example => {
        // Handle example being a simple value (e.g., if array of primitives) or an object
        if (typeof example !== 'object' || example === null || Array.isArray(example)) {
             // If it's not a standard object, stringify it
             return `(${String(example).replace(/"/g, '')})`;
        }

        const fields = Object.entries(example).map(([key, value]) => {
            // Remove surrounding quotes from the example value
            return `${key}=${String(value).replace(/"/g, '')}`;
        }).join(', ');
        return `(${fields})`;
    });

    // Join the multiple example objects with a semicolon
    return formattedExamples.join('; ');
};

// -----------------------------------------------------------------------------


export function interpretJson(jsonText) {
    const result = {
        summary: {},
        slices: [],
        warnings: []
    };

    let data;
    try {
        data = JSON.parse(jsonText);
    } catch (e) {
        result.warnings.push("Invalid JSON: " + e.message);
        return result;
    }

    if (!data.slices || !Array.isArray(data.slices)) {
        result.warnings.push("Missing 'slices' array in root object.");
        return result;
    }

    // Process each slice
    const sliceSummaries = data.slices.map((slice, index) => {
        // Safely retrieve properties, defaulting to empty arrays
        const commands = slice.commands || [];
        const events = slice.events || [];
        const screens = slice.screens || [];
        const readmodels = slice.readmodels || [];
        const specs = slice.specifications || [];

        let flow = [];
        let readmodelDetails = null; 
        
        let isTodoListProjection = false;
        let primaryReadModel = readmodels.length > 0 ? readmodels[0] : null;
        let todoEvents = []; 

        // --- Flow Logic (State Change vs. State View) ---
        if (slice.sliceType === 'STATE_VIEW') {
            // ... (STATE_VIEW logic remains unchanged)
            
            // 1. Identify Events that ADD to the list (INBOUND dependency on the ReadModel)
            const inboundEvents = events.filter(e =>
                e.dependencies.some(d => d.elementType === 'READMODEL' && d.type === 'INBOUND')
            );

            const outboundScreens = screens.filter(s =>
                s.dependencies.some(d => d.elementType === 'READMODEL' && d.type === 'OUTBOUND')
            );

            // 2. Identify Events that REMOVE from/COMPETE the list (OUTBOUND back-dependency on the ReadModel)
            // This is the signal for the "Todo List" pattern (the back-flow arrow)
            todoEvents = events.filter(e =>
                primaryReadModel &&
                e.dependencies.some(d => d.elementType === 'READMODEL' && d.type === 'OUTBOUND' && d.id === primaryReadModel.id)
            );
            
            // Determine if this is a To-Do List Projection
            isTodoListProjection = todoEvents.length > 0;
            const rmDescription = isTodoListProjection 
                ? "State projection / **TODO list (Two-event pattern)**" // Highlight the pattern
                : "State projection / User view";
            
            const rmTitle = primaryReadModel 
                ? (isTodoListProjection ? `**TODO:** ${primaryReadModel.title}` : primaryReadModel.title) 
                : "ReadModel";


            // Build Flow: EVENT ➜ READMODEL ➜ SCREEN
            flow.push(
                ...inboundEvents.map(e => ({ type: "EVENT", title: e.title, description: e.description || "Input event" })),
                ...primaryReadModel ? [{ 
                    type: "READMODEL", 
                    title: rmTitle, // Use the highlighted title
                    description: rmDescription // Use the specific description
                }] : [],
                ...outboundScreens.map(s => ({ type: "SCREEN", title: s.title, description: s.description || "User view" }))
            );

            if (isTodoListProjection) {
                 // Add the completion event to the flow array (needed for the flow visualization logic below)
                 flow.push(
                     ...todoEvents.map(e => ({ 
                         type: "EVENT", 
                         title: e.title, 
                         description: `Event that completes/removes an item from ${primaryReadModel.title}`
                     }))
                 );
                 
                 // Change the warning to an interpreter note on the pattern
                 result.warnings.push(`INTERPRETER NOTE: ReadModel "${primaryReadModel.title}" is a **To-Do List Projection**, consuming at least two events: an ADD event (${inboundEvents.map(e => e.title).join(", ")}) and a REMOVE/DONE event (${todoEvents.map(e => e.title).join(", ")} via OUTBOUND back-link to ReadModel).`);
            }

            // Detailed ReadModel info for output
            if (primaryReadModel) {
                const consumedEvents = primaryReadModel.dependencies
                    .filter(d => d.elementType === 'EVENT' && d.type === 'INBOUND')
                    .map(d => d.elementTitle);

                readmodelDetails = {
                    exists: true,
                    eventsSubscribedTo: consumedEvents.join(", ") || "(none)",
                    consumer: outboundScreens.map(s => s.title).join(", ") || "(none)",
                    todoList: isTodoListProjection
                };
            }
        }
        else if (slice.sliceType === 'STATE_CHANGE') {
            
            // Determine if this slice contains a "Completion Event"
            // We'll use case-insensitive checks for 'Prepared' or 'Completed' in commands or events.
            const isCompletionSlice = commands.some(c => c.title.toLowerCase().includes('prepared') || c.title.toLowerCase().includes('mark')) 
                                         || events.some(e => e.title.toLowerCase().includes('prepared') || e.title.toLowerCase().includes('completed'));

            // Standard Command/Event flow: Screen (inbound) -> Command -> Event (outbound)
            flow.push(
                ...screens.map(s => ({ type: "SCREEN", title: s.title, description: s.description || "User sees screen" })),
                ...commands.map(c => ({ type: "COMMAND", title: c.title, description: c.description || "Command executed" })),
                // CRITICAL CHANGE: Annotate the event if this is a completion slice
                ...events.map(e => {
                    let title = e.title;
                    // Only annotate the event that likely completes the item
                    if (isCompletionSlice && (e.title.toLowerCase().includes('prepared') || e.title.toLowerCase().includes('completed'))) {
                        title = `**${e.title} (Completes To-Do List Item)**`;
                    }
                    return { type: "EVENT", title: title, description: e.description || "Event triggered" };
                })
            );
        } 
        
        // **********************************************
        // CRITICAL ADDITION: Handle 'AUTOMATION' slice type
        // **********************************************
        else if (slice.sliceType === 'AUTOMATION') { 
             
            // Flow: External Event (inbound) -> Command -> Event (outbound)
            // No screens are expected in a pure automation slice
            flow.push(
                // In an automation flow, the external event acts as the trigger (like a screen/command initiation)
                ...events.filter(e => e.dependencies.some(d => d.type === 'EXTERNAL')).map(e => ({ 
                    type: "EVENT", 
                    title: `**EXTERNAL:** ${e.title}`, // Mark the triggering event
                    description: e.description || "External system trigger" 
                })),
                ...commands.map(c => ({ type: "COMMAND", title: c.title, description: c.description || "System Command executed" })),
                ...events.filter(e => !e.dependencies.some(d => d.type === 'EXTERNAL')).map(e => ({ 
                    type: "EVENT", 
                    title: e.title, 
                    description: e.description || "System Event triggered" 
                }))
            );
            
            result.warnings.push(`INTERPRETER NOTE: Slice "${slice.title || 'Unknown'}" is an **AUTOMATION** slice, triggered by an external event.`);
        } 
        // **********************************************
        
        else {
             // Fallback/Legacy Flow (use what's available)
             flow.push(
                 ...screens.map(s => ({ type: "SCREEN", title: s.title })),
                 ...commands.map(c => ({ type: "COMMAND", title: c.title })),
                 ...events.map(e => ({ type: "EVENT", title: e.title }))
             );
             result.warnings.push(`Slice "${slice.title || 'Unknown'}" has unknown/unhandled sliceType: ${slice.sliceType}.`);
        }

        // --- Visual Flow String Generation (with To-Do List Fix) ---
        // ... (This section remains largely the same, but the 'AUTOMATION' slice will use the Generic Flow construction.)
        let visualFlow = "";
        
        if (slice.sliceType === 'STATE_VIEW' && isTodoListProjection && primaryReadModel && todoEvents.length > 0) {
            // MANUAL CONSTRUCTION for To-Do List Pattern: A ➜ B ⇠ C ➜ D
            
            const rmTitle = primaryReadModel.title;
            const rmDisplayTitle = `**TODO:** ${rmTitle}`;
            const completionEventTitle = todoEvents[0].title;
            
            // Gather element titles for forward/backward flow, excluding the completion event from the initial pass
            const flowTitlesSeen = new Set();
            const forwardElements = flow.filter(f => {
                const isCompletionEvent = todoEvents.some(e => e.title === f.title);
                const uniqueKey = `${f.type}:${f.title}`; 
                
                // Exclude the completion event and ensure uniqueness of other elements
                if (isCompletionEvent || !f.title || flowTitlesSeen.has(uniqueKey)) return false;
                
                flowTitlesSeen.add(uniqueKey);
                return true;
            }).map(f => f.title);

            // Find the index of the Read Model (the center pivot)
            const rmIndex = forwardElements.findIndex(t => t.includes(rmDisplayTitle) || t.includes(rmTitle));
            
            if (rmIndex !== -1) {
                // Split the array around the Read Model
                const preRM = forwardElements.slice(0, rmIndex + 1);
                const postRM = forwardElements.slice(rmIndex + 1);
                
                // Build the flow as: Pre-RM ➜ RM **⇠** Completion Event ➜ Post-RM
                visualFlow = [...preRM, `**⇠** ${completionEventTitle}`, ...postRM].join(" ➜ ");
            } else {
                // Fallback if the RM title wasn't found (shouldn't happen with correct data)
                visualFlow = forwardElements.join(" ➜ ");
            }
            
        } else {
            // Generic Flow Construction (for STATE_CHANGE, AUTOMATION, and non-To-Do STATE_VIEW)
            const flowTitlesSeen = new Set();
            visualFlow = flow
                .filter(f => {
                    if (!f.title || flowTitlesSeen.has(f.title)) return false;
                    flowTitlesSeen.add(f.title);
                    return true;
                })
                .map(f => f.title)
                .join(" ➜ ");
        }


        // --- Robust BDD tests implementation (Handling all formats) ---
        // ... (This section remains unchanged as it processes all 'specs' regardless of slice type)

        const bddTests = specs.map(spec => {
            
            const mapSteps = (steps) => {
                // Ensure steps is an array before attempting to map
                return (steps || []).map(step => {
                    let fieldsString;
                    // Check for list data in the 'examples' array
                    const hasExamples = Array.isArray(step.examples) && step.examples.length > 0;
                    
                    // Priority 1: If 'examples' (list data) is present, use the list formatter.
                    if (hasExamples) {
                        fieldsString = formatReadModelExamples(step.examples);
                        
                        // Check for conflicting data and warn
                        if (Array.isArray(step.fields) && step.fields.length > 0) {
                            result.warnings.push(`BDD Specification "${spec.title}" in slice "${slice.title}" step '${step.title}' has data in both 'fields' and 'examples'. Prioritized data in 'examples' and skipped 'fields'.`);
                        }
                    } 
                    // Priority 2: If no 'examples', use the standard fields formatter.
                    else {
                        fieldsString = formatFields(step.fields);
                    }

                    return {
                        title: step.title,
                        type: step.type, // Use the type provided (GIVEN, SPEC_EVENT, etc.)
                        fields: fieldsString
                    };
                });
            };

            return {
                title: spec.title,
                comments: spec.comments?.map(c => c.description) || [],
                given: mapSteps(spec.given),
                when: mapSteps(spec.when),
                then: mapSteps(spec.then)
            };
        });


        // Build slice object
        const sliceObj = {
            index: index + 1,
            title: slice.title,
            sliceType: slice.sliceType,
            flow,
            visualFlow,
            commands: commands.map(c => ({ title: c.title, description: c.description || "Command executed" })),
            events: events.map(e => ({ title: e.title, description: e.description || "Event triggered" })),
            screens: screens.map(s => ({ title: s.title, description: s.description || "User sees screen" })),
            readmodels: readmodels.map(rm => ({ title: rm.title, description: rm.description || "State projection" })), 
            readmodelDetails, 
            bddTests
        };

        result.slices.push(sliceObj);
        return sliceObj;
    });

    // Global summary
    result.summary = {
        totalSlices: data.slices.length,
        totalCommands: data.slices.reduce((acc, s) => acc + (s.commands?.length || 0), 0),
        totalEvents: data.slices.reduce((acc, s) => acc + (s.events?.length || 0), 0),
        totalScreens: data.slices.reduce((acc, s) => acc + (s.screens?.length || 0), 0),
        totalReadModels: data.slices.reduce((acc, s) => acc + (s.readmodels?.length || 0), 0), 
        totalSpecifications: data.slices.reduce((acc, s) => acc + (s.specifications?.length || 0), 0),
        sliceDetails: sliceSummaries
    };

    return result;
}