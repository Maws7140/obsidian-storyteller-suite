// @ts-nocheck
/**
 * timeline-arrows
 * https://github.com/javdome/timeline-arrows
 *
 * Class to easily draw lines to connect items in the vis Timeline module.
 *
 * @version 4.8.0
 * @date    2025-09-22
 *
 * @copyright (c) Javi Domenech (javdome@gmail.com) 
 *
 *
 * @license
 * timeline-arrows is dual licensed under both
 *
 *   1. The Apache 2.0 License
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *   and
 *
 *   2. The MIT License
 *      http://opensource.org/licenses/MIT
 *
 * timeline-arrows may be distributed under either license.
 */

/**
 * @typedef {(number | string)} VisIdType Timeline view item id. Equivalent to vis.IdType.
 */

/**
 * @typedef {(number | string)} ArrowIdType arrow id.
 */

/**
 * @typedef ArrowSpec Arrow specification
 * @property {ArrowIdType} id arrow id
 * @property {VisIdType} id_item_1 start timeline item id
 * @property {VisIdType} id_item_2 end timeline item id
 * @property {string} [title] optional arrow title
 * @property {string} [color] optional arrow color
 * @property {number} [direction] arrow direction: 0=no arrows, 1=forward only, 2=backward only, 3=both directions
 * @property {number} [line] line type: 0=solid (default), 1=dashed
 * @property {string} [align] if 'center', line is straight
 * @property {number} [type] line shape: 0=bezier(default), 1=straight, 2=cornered
 */

/**
 * @typedef ArrowOptions Arrow configuration options
 * @property {boolean} [followRelationships] if true, arrows can point backwards and will follow the relationships set in the data
 * @property {(el: SVGPathElement, title: string) => string } [tooltipConfig] if arrows have a `title` property, the default behavior will add a title attribute that shows on hover. However, you might not want to use the title attribute, but instead your own tooltip configuration.
        This method takes two arguments, `el` - the arrow - and `title` - the content of the `title` property set in the arrow data.
 * @property {string} [color] arrow color
 * @property {number} [strokeWidth] arrow thickness in pixels
 * @property {boolean} [hideWhenItemsNotVisible] if true, arrows will be hidden when both items is not visible due to timeline zoom.
 */

/** Arrow set for a vis.js Timeline. */
export default class Arrow {

    /**
     * Creates arrows.
     * @param {*} timeline timeline object
     * @param {ArrowSpec[]} dependencies arrows
     * @param {ArrowOptions} [options] 
     */
    constructor(timeline, dependencies, options) {
        this._svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this._timeline = timeline;

        /** @private @type {boolean | undefined} if true, arrows can point backwards and will follow the relationships set in the data */
        this._followRelationships = options?.followRelationships;
        /** @private @type {((el: SVGPathElement, title: string) => string) | undefined } */
        this._tooltipConfig = options?.tooltipConfig;

        /** @private @type {string} color */
        this._arrowsColor = options?.color ? options.color : "#9c0000"
        /** @private @type {number} arrow thickness in pixels */
        this._arrowsStrokeWidth = options?.strokeWidth ?? 3;

        /** @private @type {boolean} if true, arrows will be hidden when both items is not visible due to timeline zoom  */
        this._hideWhenItemsNotVisible = options?.hideWhenItemsNotVisible ?? true;

        /** @private @type {Map<string, string>} map of color to marker id */
        this._colorMarkers = new Map();

        this._dependency = [...dependencies];

        /** @private @type {SVGPathElement[]} */
        this._dependencyPath = [];

        /** @private @type {string} */
        this._arrowHeadId = `arrowhead-${Math.random().toString(36).substring(2)}`;

        this._initialize();
    }

    _initialize() {
        //Configures the SVG layer and add it to timeline
        this._svg.style.position = "absolute";
        this._svg.style.top = "0px";
        this._svg.style.height = "100%";
        this._svg.style.width = "100%";
        this._svg.style.display = "block";
        this._svg.style.zIndex = "1"; // Should it be above or below? (1 for above, -1 for below)
        this._svg.style.pointerEvents = "none"; // To click through, if we decide to put it above other elements.
        this._timeline.dom.center.appendChild(this._svg);

        //Create paths for the started dependency array
        for (let i = 0; i < this._dependency.length; i++) {
            this._createPath(this._dependency[i].color, this._dependency[i].line);
        }

        //NOTE: We hijack the on "changed" event to draw the arrows.
        this._timeline.on("changed", () => {
            this._drawDependencies();
        });

    }

    /** @private */
    _getOrCreateMarker(color) {
        const arrowColor = color || this._arrowsColor;

        if (!this._colorMarkers.has(arrowColor)) {
            const markerId = `arrowhead-${arrowColor.replace('#', '')}-${Math.random().toString(36).substring(2)}`;

            const arrowHead = document.createElementNS("http://www.w3.org/2000/svg", "marker");
            arrowHead.setAttribute("id", markerId);
            arrowHead.setAttribute("viewBox", "-10 -5 10 10");
            arrowHead.setAttribute("refX", "-7");
            arrowHead.setAttribute("refY", "0");
            arrowHead.setAttribute("markerUnits", "strokeWidth");
            arrowHead.setAttribute("markerWidth", "3");
            arrowHead.setAttribute("markerHeight", "3");
            arrowHead.setAttribute("orient", "auto-start-reverse");

            const arrowHeadPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            arrowHeadPath.setAttribute("d", "M 0 0 L -10 -5 L -7.5 0 L -10 5 z");
            arrowHeadPath.style.fill = arrowColor;

            arrowHead.appendChild(arrowHeadPath);
            this._svg.appendChild(arrowHead);

            this._colorMarkers.set(arrowColor, markerId);
        }

        return this._colorMarkers.get(arrowColor);
    }

    /** @private */
    _createPath(color, lineType) {
        //Add a new path to array dependencyPath and to svg
        let somePath = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
        );
        somePath.setAttribute("d", "M 0 0");
        somePath.style.stroke = color || this._arrowsColor;
        somePath.style.strokeWidth = this._arrowsStrokeWidth + "px";
        somePath.style.fill = "none";
        somePath.style.pointerEvents = "auto";

        // Set the line type
        const line = lineType !== undefined ? lineType : 0; // Default to solid line
        if (line === 0) {
            // Type 0: Solid line (default)
            somePath.style.strokeDasharray = "none";
        } else if (line === 1) {
            // Type 1: Dashed line
            somePath.style.strokeDasharray = "7,5";
        }
        // You can add more line types here:
        // } else if (line === 2) {
        //     // Type 2: Dotted line
        //     somePath.style.strokeDasharray = "2,3";
        // } else if (line === 3) {
        //     // Type 3: Dash-dot line
        //     somePath.style.strokeDasharray = "10,5,2,5";
        // }

        this._dependencyPath.push(somePath);
        this._svg.appendChild(somePath);
    }


    /** @private */
    _drawDependencies() {
        //Create paths for the started dependency array
        for (let i = 0; i < this._dependency.length; i++) {
            this._drawArrows(this._dependency[i], i);
        }
    }

    /**
     * @private 
     * @param {ArrowSpec} dep arrow specification
     * @param {number} index arrow index
     */
    _drawArrows(dep, index) {
        //Checks if both items exist
        //if( (typeof this._timeline.itemsData._data[dep.id_item_1] !== "undefined") && (typeof this._timeline.itemsData._data[dep.id_item_2] !== "undefined") ) {

        const bothItemsExist = (this._timeline.itemsData.get(dep.id_item_1) !== null) && (this._timeline.itemsData.get(dep.id_item_2) !== null);

        //Checks if at least one item is visible in screen
        let oneItemVisible = false; // Initialize as false
        //Checks if the groups of items are both visible
        let groupOf_1_isVisible = false; // Initialize as false
        let groupOf_2_isVisible = false; // Initialize as false

        if (bothItemsExist) {
            const visibleItems = this._timeline.getVisibleItems();
            for (let k = 0; k < visibleItems.length; k++) {
                if (dep.id_item_1 == visibleItems[k]) oneItemVisible = true;
                if (dep.id_item_2 == visibleItems[k]) oneItemVisible = true;
            }

            if (this._timeline.groupsData) { // If groups are defined

                let groupOf_1 = this._timeline.itemsData.get(dep.id_item_1).group; //let groupOf_1 = items.get(dep.id_item_1).group;

                let groupOf_2 = this._timeline.itemsData.get(dep.id_item_2).group; //let groupOf_2 = items.get(dep.id_item_2).group;

                if (this._timeline.groupsData.get(groupOf_1)) groupOf_1_isVisible = true;

                if (this._timeline.groupsData.get(groupOf_2)) groupOf_2_isVisible = true;


                // If groups are null then they are not visible.
                if (groupOf_1 == null) {
                    groupOf_1_isVisible = false;
                }
                if (groupOf_2 == null) {
                    groupOf_2_isVisible = false;
                }
            } else {
                groupOf_1_isVisible = true;
                groupOf_2_isVisible = true;
            }

        }

        if ((groupOf_1_isVisible && groupOf_2_isVisible) && (oneItemVisible || !this._hideWhenItemsNotVisible) && (bothItemsExist)) {
            var item_1 = this._getItemPos(this._timeline.itemSet.items[dep.id_item_1]);
            var item_2 = this._getItemPos(this._timeline.itemSet.items[dep.id_item_2]);

            // For arrows without special parameters (type: 0, no align), return the old behavior
            const arrowType = dep.type !== undefined ? dep.type : 0;
            const isDefaultArrow = arrowType === 0 && !dep.align;
            let swapped = false;

            if (isDefaultArrow && !this._followRelationships && item_2.mid_x < item_1.mid_x) {
                [item_1, item_2] = [item_2, item_1]; // Swap for standard arrows
                swapped = true;
            }

            var curveLen = item_1.height * 2;
            const markerId = this._getOrCreateMarker(dep.color);
            const direction = dep.direction !== undefined ? dep.direction : 1;
            let markerStart = "";
            let markerEnd = "";

            // direction logic
            if (direction === 0) {
                markerStart = "";
                markerEnd = "";
            } else if (direction === 1) {
                // arrow always at the second event
                if (isDefaultArrow && swapped) {
                    markerStart = `url(#${markerId})`;
                    markerEnd = "";
                } else {
                    markerStart = "";
                    markerEnd = `url(#${markerId})`;
                }
            } else if (direction === 2) {
                // arrow always at the first event
                if (isDefaultArrow && swapped) {
                    markerStart = "";
                    markerEnd = `url(#${markerId})`;
                } else {
                    markerStart = `url(#${markerId})`;
                    markerEnd = "";
                }
            } else if (direction === 3) {
                markerStart = `url(#${markerId})`;
                markerEnd = `url(#${markerId})`;
            }

            // --- Path construction ---
            let pathStr;
            if (arrowType === 1) {
                // Straight line
                const x1 = item_1.mid_x;
                const y1 = item_1.mid_y;
                const x2 = item_2.mid_x;
                const y2 = item_2.mid_y;

                const getRectIntersection = (rect, x0, y0, x1, y1, offset = 0) => {
                    // Direction vector
                    const dx = x1 - x0;
                    const dy = y1 - y0;
                    let candidates = [];
                    // Left side
                    if (dx !== 0) {
                        const t = (rect.left - x0) / dx;
                        if (t > 0 && t < 1) {
                            const y = y0 + t * dy;
                            if (y >= rect.top && y <= rect.bottom) candidates.push({ x: rect.left, y, t });
                        }
                    }
                    // Right side
                    if (dx !== 0) {
                        const t = (rect.right - x0) / dx;
                        if (t > 0 && t < 1) {
                            const y = y0 + t * dy;
                            if (y >= rect.top && y <= rect.bottom) candidates.push({ x: rect.right, y, t });
                        }
                    }
                    // Top side
                    if (dy !== 0) {
                        const t = (rect.top - y0) / dy;
                        if (t > 0 && t < 1) {
                            const x = x0 + t * dx;
                            if (x >= rect.left && x <= rect.right) candidates.push({ x, y: rect.top, t });
                        }
                    }
                    // Bottom side
                    if (dy !== 0) {
                        const t = (rect.bottom - y0) / dy;
                        if (t > 0 && t < 1) {
                            const x = x0 + t * dx;
                            if (x >= rect.left && x <= rect.right) candidates.push({ x, y: rect.bottom, t });
                        }
                    }
                    // Choose the point closest to the center
                    if (candidates.length === 0) return { x: x0, y: y0 };
                    candidates.sort((a, b) => Math.hypot(a.x - x0, a.y - y0) - Math.hypot(b.x - x0, b.y - y0));
                    let pt = candidates[0];
                    // Add offset if required
                    if (offset > 0) {
                        const norm = Math.hypot(dx, dy);
                        if (norm > 0) {
                            pt.x += (dx / norm) * offset;
                            pt.y += (dy / norm) * offset;
                        }
                    }
                    return pt;
                }
                // Determine if we need offset at the ends
                let offset1 = 0, offset2 = 0;
                if (direction === 1) offset2 = 10; // arrow only at second end
                if (direction === 2) offset1 = 10; // arrow only at first end
                if (direction === 3) { offset1 = 10; offset2 = 10; } // arrows at both ends
                // Find intersection points
                const pt1 = getRectIntersection(item_1, x1, y1, x2, y2, offset1); // from first center to second center
                const pt2 = getRectIntersection(item_2, x2, y2, x1, y1, offset2); // from second center to first center
                pathStr = `M ${pt1.x} ${pt1.y} L ${pt2.x} ${pt2.y}`;
            } else if (arrowType === 2) {
                const offset = 10;
                let start, end, sign;
                if (item_1.mid_x < item_2.mid_x) {
                    start = { x: item_1.right, y: item_1.mid_y };
                    end = { x: item_2.left, y: item_2.mid_y };
                    sign = 1;
                } else {
                    start = { x: item_1.left, y: item_1.mid_y };
                    end = { x: item_2.right, y: item_2.mid_y };
                    sign = -1;
                }
                // Arrow spacing
                if (direction === 1 || direction === 3) end.x -= 10 * sign;
                if (direction === 2 || direction === 3) start.x += 10 * sign;

                // Check for overlap or proximity
                const overlap = (item_1.left < item_2.right && item_1.right > item_2.left);
                const close = Math.abs(end.x - start.x) < offset * 2;
                if (overlap || close) {
                    // 4 bends
                    const xA = start.x + offset * sign;
                    const xB = end.x - offset * sign;
                    const midY = (start.y + end.y) / 2;
                    pathStr = `M ${start.x} ${start.y} L ${xA} ${start.y} L ${xA} ${midY} L ${xB} ${midY} L ${xB} ${end.y} L ${end.x} ${end.y}`;
                } else {
                    // 2 bends
                    const xA = start.x + offset * sign;
                    pathStr = `M ${start.x} ${start.y} L ${xA} ${start.y} L ${xA} ${end.y} L ${end.x} ${end.y}`;
                }
            } else if (dep.align === 'center') {
                // --- Corrected algorithm: line between nearest-to-center intersection points ---
                const x1 = item_1.mid_x;
                const y1 = item_1.mid_y;
                const x2 = item_2.mid_x;
                const y2 = item_2.mid_y;

                const getRectIntersection = (rect, x0, y0, x1, y1, offset = 0) => {
                    // Direction vector
                    const dx = x1 - x0;
                    const dy = y1 - y0;
                    let candidates = [];
                    // Left side
                    if (dx !== 0) {
                        const t = (rect.left - x0) / dx;
                        if (t > 0 && t < 1) {
                            const y = y0 + t * dy;
                            if (y >= rect.top && y <= rect.bottom) candidates.push({ x: rect.left, y, t });
                        }
                    }
                    // Right side
                    if (dx !== 0) {
                        const t = (rect.right - x0) / dx;
                        if (t > 0 && t < 1) {
                            const y = y0 + t * dy;
                            if (y >= rect.top && y <= rect.bottom) candidates.push({ x: rect.right, y, t });
                        }
                    }
                    // Top side
                    if (dy !== 0) {
                        const t = (rect.top - y0) / dy;
                        if (t > 0 && t < 1) {
                            const x = x0 + t * dx;
                            if (x >= rect.left && x <= rect.right) candidates.push({ x, y: rect.top, t });
                        }
                    }
                    // Bottom side
                    if (dy !== 0) {
                        const t = (rect.bottom - y0) / dy;
                        if (t > 0 && t < 1) {
                            const x = x0 + t * dx;
                            if (x >= rect.left && x <= rect.right) candidates.push({ x, y: rect.bottom, t });
                        }
                    }
                    // Choose the point closest to the center
                    if (candidates.length === 0) return { x: x0, y: y0 };
                    candidates.sort((a, b) => Math.hypot(a.x - x0, a.y - y0) - Math.hypot(b.x - x0, b.y - y0));
                    let pt = candidates[0];
                    // Add offset if required
                    if (offset > 0) {
                        const norm = Math.hypot(dx, dy);
                        if (norm > 0) {
                            pt.x += (dx / norm) * offset;
                            pt.y += (dy / norm) * offset;
                        }
                    }
                    return pt;
                }
                // Determine if we need offset at the ends
                let offset1 = 0, offset2 = 0;
                if (direction === 1) offset2 = 10; // arrow only at second end
                if (direction === 2) offset1 = 10; // arrow only at first end
                if (direction === 3) { offset1 = 10; offset2 = 10; } // arrows at both ends
                // Find intersection points
                const pt1 = getRectIntersection(item_1, x1, y1, x2, y2, offset1); // from first center to second center
                const pt2 = getRectIntersection(item_2, x2, y2, x1, y1, offset2); // from second center to first center
                pathStr = `M ${pt1.x} ${pt1.y} L ${pt2.x} ${pt2.y}`;
            } else {
                // Bezier (default)
                if (this._followRelationships && item_2.mid_x < item_1.mid_x) {
                    if (markerStart !== "") item_2.right += 10;
                    if (markerEnd !== "") item_1.left -= 10;
                    pathStr =
                        "M " +
                        item_2.right +
                        " " +
                        item_2.mid_y +
                        " C " +
                        (item_2.right + curveLen) +
                        " " +
                        item_2.mid_y +
                        " " +
                        (item_1.left - curveLen) +
                        " " +
                        item_1.mid_y +
                        " " +
                        item_1.left +
                        " " +
                        item_1.mid_y;
                } else {
                    if (markerEnd !== "") item_2.left -= 10;
                    if (markerStart !== "") item_1.right += 10;
                    pathStr =
                        "M " +
                        item_1.right +
                        " " +
                        item_1.mid_y +
                        " C " +
                        (item_1.right + curveLen) +
                        " " +
                        item_1.mid_y +
                        " " +
                        (item_2.left - curveLen) +
                        " " +
                        item_2.mid_y +
                        " " +
                        item_2.left +
                        " " +
                        item_2.mid_y;
                }
            }
            // --- End of path construction ---
            if (this._followRelationships && item_2.mid_x < item_1.mid_x) {
                this._dependencyPath[index].setAttribute("marker-start", markerStart);
                this._dependencyPath[index].setAttribute("marker-end", markerEnd);
                this._dependencyPath[index].setAttribute("d", pathStr);
            } else {
                this._dependencyPath[index].setAttribute("marker-end", markerEnd);
                this._dependencyPath[index].setAttribute("marker-start", markerStart);
                this._dependencyPath[index].setAttribute("d", pathStr);
            }

            // Adding the title if property title has been added in the dependency
            if (dep.hasOwnProperty("title")) {
                this._tooltipConfig
                    ? this._tooltipConfig(this._dependencyPath[index], dep.title ?? '')
                    : this._dependencyPath[index].innerHTML = "<title>" + dep.title + "</title>";
            }
        } else {
            this._dependencyPath[index].setAttribute("marker-end", "");
            this._dependencyPath[index].setAttribute("d", "M 0 0");
        }

    }

    /** @private Función que recibe in Item y devuelve la posición en pantalla del item. */
    _getItemPos(item) {
        let left_x = item.left;
        let top_y;
        if (this._timeline.options.orientation.item == "top") {
            top_y = item.parent.top + item.top;
        } else {
            top_y = item.parent.top + item.parent.height - item.top - item.height;
        }
        return {
            left: left_x,
            top: top_y,
            right: left_x + item.width,
            bottom: top_y + item.height,
            mid_x: left_x + item.width / 2,
            mid_y: top_y + item.height / 2,
            width: item.width,
            height: item.height
        }
    }


    /**
     * Adds arrow between two timeline items.
     * @param {ArrowSpec} dep item dependency
     */
    addArrow(dep) {
        this._dependency.push(dep);
        this._createPath(dep.color, dep.line);
        this._timeline.redraw();
    }

    /**
     * Get arrow by ID.
     * @param {ArrowIdType} id arrow ID
     * @returns {ArrowSpec | null} arrow spec, or null
     */
    getArrow(id) {
        return this._dependency.find(dep => dep.id === id) ?? null;
    }


    /**
     * Get all Id arrows.
     *
     * @return {(ArrowIdType)[]} list of id arrows
     */
    getIdArrows() {
        return this._dependency.map(dep => dep.id);
    }

    /**
     * Finds arrow with the given id and removes it.
     * Función que recibe el id de una flecha y la elimina.
     * @param {ArrowIdType} id arrow id
     */
    removeArrow(id) {
        const index = this._dependency.findIndex(dep => dep.id === id);

        if (index >= 0) {

            //var list = document.getElementsByTagName("path"); //FALTA QUE ESTA SELECCION LA HAGA PARA EL DOM DEL TIMELINE INSTANCIADO!!!!
            const list = document.querySelectorAll("#" + this._timeline.dom.container.id + " path");

            this._dependency.splice(index, 1); //Elimino del array dependency
            this._dependencyPath.splice(index, 1); //Elimino del array dependencyPath

            list[index].parentNode?.removeChild(list[index]); //Lo elimino del dom

        }
    }

    /**
     * Finds all arrows related to one view item and removes them all.
     * Funcция que recibe el id de un item y elimina la flecha.
     * @param {VisIdType} id view item id
     * @returns {(ArrowIdType)[]} list of removed arrow ids
     */
    removeItemArrows(id) {
        let listOfRemovedArrows = [];
        for (let i = 0; i < this._dependency.length; i++) {
            if ((this._dependency[i].id_item_1 == id) || (this._dependency[i].id_item_2 == id)) {
                listOfRemovedArrows.push(this._dependency[i].id);
                this.removeArrow(this._dependency[i].id);
                i--;
            }
        }
        return listOfRemovedArrows;
    }

    /**
     * Removes the arrows between item 1 and item 2.
     * @param {VisIdType} itemId1 item id
     * @param {VisIdType} itemId2 item id
     * @returns {(ArrowIdType)[]} id of the removed arrow 
     */
    removeArrowsBetweenItems(itemId1, itemId2) {
        let listOfRemovedArrows = [];
        let ArrowsToDelete = this._dependency.filter(dep => (dep.id_item_1 == itemId1 && dep.id_item_2 == itemId2))
        ArrowsToDelete.forEach(dep => {
            listOfRemovedArrows.push(dep.id);
            this.removeArrow(dep.id)
        })
        return listOfRemovedArrows
    }


    /**
     * For backward compatibility
     * @deprecated use the removeItemArrows method instead.
     */
    removeArrowbyItemId(id) {
        this.removeItemArrows(id);
    }

}

