(function(global){
// *************************************************************
//   LiteGraph CLASS                                     *******
// *************************************************************

/**
* The Global Scope. It contains all the registered node classes.
*
* @class LiteGraph
* @constructor
*/

var LiteGraph = global.LiteGraph = {

	CANVAS_GRID_SIZE: 10,
	
	NODE_TITLE_HEIGHT: 20,
	NODE_SLOT_HEIGHT: 15,
	NODE_WIDGET_HEIGHT: 20,
	NODE_WIDTH: 140,
	NODE_MIN_WIDTH: 50,
	NODE_COLLAPSED_RADIUS: 10,
	NODE_COLLAPSED_WIDTH: 80,
	NODE_TITLE_COLOR: "#999",
	NODE_TEXT_SIZE: 14,
	NODE_TEXT_COLOR: "#AAA",
	NODE_SUBTEXT_SIZE: 12,
	NODE_DEFAULT_COLOR: "#333",
	NODE_DEFAULT_BGCOLOR: "#444",
	NODE_DEFAULT_BOXCOLOR: "#666",
	NODE_DEFAULT_SHAPE: "box",
	DEFAULT_SHADOW_COLOR: "rgba(0,0,0,0.5)",
	DEFAULT_GROUP_FONT: 24,

	LINK_COLOR: "#AAD",
	EVENT_LINK_COLOR: "#F85",
	CONNECTING_LINK_COLOR: "#AFA",

	MAX_NUMBER_OF_NODES: 1000, //avoid infinite loops
	DEFAULT_POSITION: [100,100],//default node position
	VALID_SHAPES: ["default","box","round","card"], //,"circle"

	//shapes are used for nodes but also for slots
	BOX_SHAPE: 1,
	ROUND_SHAPE: 2,
	CIRCLE_SHAPE: 3,
	CARD_SHAPE: 4,
	ARROW_SHAPE: 5,

	//enums
	INPUT: 1,
	OUTPUT: 2,

	EVENT: -1, //for outputs
	ACTION: -1, //for inputs

	ALWAYS: 0,
	ON_EVENT: 1,
	NEVER: 2,
	ON_TRIGGER: 3,

	UP: 1,
	DOWN:2,
	LEFT:3,
	RIGHT:4,
	CENTER:5,

	NORMAL_TITLE: 0,
	NO_TITLE: 1,
	TRANSPARENT_TITLE: 2,
	AUTOHIDE_TITLE: 3,

	proxy: null, //used to redirect calls
	node_images_path: "",

	debug: false,
	catch_exceptions: true,
	throw_errors: true,
	allow_scripts: false,
	registered_node_types: {}, //nodetypes by string
	node_types_by_file_extension: {}, //used for droping files in the canvas
	Nodes: {}, //node types by classname

	searchbox_extras: {}, //used to add extra features to the search box

	/**
	* Register a node class so it can be listed when the user wants to create a new one
	* @method registerNodeType
	* @param {String} type name of the node and path
	* @param {Class} base_class class containing the structure of a node
	*/

	registerNodeType: function(type, base_class)
	{
		if(!base_class.prototype)
			throw("Cannot register a simple object, it must be a class with a prototype");
		base_class.type = type;

		if(LiteGraph.debug)
			console.log("Node registered: " + type);

		var categories = type.split("/");
		var classname = base_class.name;

		var pos = type.lastIndexOf("/");
		base_class.category = type.substr(0,pos);

		if(!base_class.title)
			base_class.title = classname;
		//info.name = name.substr(pos+1,name.length - pos);

		//extend class
		if(base_class.prototype) //is a class
			for(var i in LGraphNode.prototype)
				if(!base_class.prototype[i])
					base_class.prototype[i] = LGraphNode.prototype[i];

		Object.defineProperty( base_class.prototype, "shape",{
			set: function(v) {
				switch(v)
				{
					case "default": delete this._shape; break;
					case "box": this._shape = LiteGraph.BOX_SHAPE; break;
					case "round": this._shape = LiteGraph.ROUND_SHAPE; break;
					case "circle": this._shape = LiteGraph.CIRCLE_SHAPE; break;
					case "card": this._shape = LiteGraph.CARD_SHAPE; break;
					default:
						this._shape = v;
				}
			},
			get: function(v)
			{
				return this._shape;
			},
			enumerable: true
		});

		this.registered_node_types[ type ] = base_class;
		if(base_class.constructor.name)
			this.Nodes[ classname ] = base_class;

		//warnings
		if(base_class.prototype.onPropertyChange)
			console.warn("LiteGraph node class " + type + " has onPropertyChange method, it must be called onPropertyChanged with d at the end");

		if( base_class.supported_extensions )
		{
			for(var i in base_class.supported_extensions )
				this.node_types_by_file_extension[ base_class.supported_extensions[i].toLowerCase() ] = base_class;
		}
	},

	/**
	* Create a new node type by passing a function, it wraps it with a propper class and generates inputs according to the parameters of the function.
	* Useful to wrap simple methods that do not require properties, and that only process some input to generate an output.
	* @method wrapFunctionAsNode
	* @param {String} name node name with namespace (p.e.: 'math/sum')
	* @param {Function} func
	* @param {Array} param_types [optional] an array containing the type of every parameter, otherwise parameters will accept any type
	* @param {String} return_type [optional] string with the return type, otherwise it will be generic
	*/
	wrapFunctionAsNode: function( name, func, param_types, return_type )
	{
		var params = Array(func.length);
		var code = "";
		var names = LiteGraph.getParameterNames( func );
		for(var i = 0; i < names.length; ++i)
			code += "this.addInput('"+names[i]+"',"+(param_types && param_types[i] ? "'" + param_types[i] + "'" : "0") + ");\n";
		code += "this.addOutput('out',"+( return_type ? "'" + return_type + "'" : 0 )+");\n";
		var classobj = Function(code);
		classobj.title = name.split("/").pop();
		classobj.desc = "Generated from " + func.name;
		classobj.prototype.onExecute = function onExecute()
		{
			for(var i = 0; i < params.length; ++i)
				params[i] = this.getInputData(i);
			var r = func.apply( this, params );
			this.setOutputData(0,r);
		}
		this.registerNodeType( name, classobj );
	},

	/**
	* Adds this method to all nodetypes, existing and to be created
	* (You can add it to LGraphNode.prototype but then existing node types wont have it)
	* @method addNodeMethod
	* @param {Function} func
	*/
	addNodeMethod: function( name, func )
	{
		LGraphNode.prototype[name] = func;
		for(var i in this.registered_node_types)
		{
			var type = this.registered_node_types[i];
			if(type.prototype[name])
				type.prototype["_" + name] = type.prototype[name]; //keep old in case of replacing
			type.prototype[name] = func;
		}
	},

	/**
	* Create a node of a given type with a name. The node is not attached to any graph yet.
	* @method createNode
	* @param {String} type full name of the node class. p.e. "math/sin"
	* @param {String} name a name to distinguish from other nodes
	* @param {Object} options to set options
	*/

	createNode: function( type, title, options )
	{
		var base_class = this.registered_node_types[type];
		if (!base_class)
		{
			if(LiteGraph.debug)
				console.log("GraphNode type \"" + type + "\" not registered.");
			return null;
		}

		var prototype = base_class.prototype || base_class;

		title = title || base_class.title || type;

		var node = null;

		if( LiteGraph.catch_exceptions )
		{
			try
			{
				node = new base_class( title );
			}
			catch (err)
			{
				console.error(err);
				return null;
			}
		}
		else
			node = new base_class( title );

		node.type = type;

		if(!node.title && title) node.title = title;
		if(!node.properties) node.properties = {};
		if(!node.properties_info) node.properties_info = [];
		if(!node.flags) node.flags = {};
		if(!node.size) node.size = node.computeSize();
		if(!node.pos) node.pos = LiteGraph.DEFAULT_POSITION.concat();
		if(!node.mode) node.mode = LiteGraph.ALWAYS;

		//extra options
		if(options)
		{
			for(var i in options)
				node[i] = options[i];
		}

		return node;
	},

	/**
	* Returns a registered node type with a given name
	* @method getNodeType
	* @param {String} type full name of the node class. p.e. "math/sin"
	* @return {Class} the node class
	*/

	getNodeType: function(type)
	{
		return this.registered_node_types[type];
	},


	/**
	* Returns a list of node types matching one category
	* @method getNodeType
	* @param {String} category category name
	* @return {Array} array with all the node classes
	*/

	getNodeTypesInCategory: function( category, filter )
	{
		var r = [];
		for(var i in this.registered_node_types)
		{
			var type = this.registered_node_types[i];
			if(filter && type.filter && type.filter != filter)
				continue;

			if(category == "" )
			{
				if (type.category == null)
					r.push(type);
			}
			else if (type.category == category)
				r.push(type);
		}

		return r;
	},

	/**
	* Returns a list with all the node type categories
	* @method getNodeTypesCategories
	* @return {Array} array with all the names of the categories
	*/

	getNodeTypesCategories: function()
	{
		var categories = {"":1};
		for(var i in this.registered_node_types)
			if(this.registered_node_types[i].category && !this.registered_node_types[i].skip_list)
				categories[ this.registered_node_types[i].category ] = 1;
		var result = [];
		for(var i in categories)
			result.push(i);
		return result;
	},

	//debug purposes: reloads all the js scripts that matches a wilcard
	reloadNodes: function (folder_wildcard)
	{
		var tmp = document.getElementsByTagName("script");
		//weird, this array changes by its own, so we use a copy
		var script_files = [];
		for(var i in tmp)
			script_files.push(tmp[i]);


		var docHeadObj = document.getElementsByTagName("head")[0];
		folder_wildcard = document.location.href + folder_wildcard;

		for(var i in script_files)
		{
			var src = script_files[i].src;
			if( !src || src.substr(0,folder_wildcard.length ) != folder_wildcard)
				continue;

			try
			{
				if(LiteGraph.debug)
					console.log("Reloading: " + src);
				var dynamicScript = document.createElement("script");
				dynamicScript.type = "text/javascript";
				dynamicScript.src = src;
				docHeadObj.appendChild(dynamicScript);
				docHeadObj.removeChild(script_files[i]);
			}
			catch (err)
			{
				if(LiteGraph.throw_errors)
					throw err;
				if(LiteGraph.debug)
					console.log("Error while reloading " + src);
			}
		}

		if(LiteGraph.debug)
			console.log("Nodes reloaded");
	},

	//separated just to improve if it doesnt work
	cloneObject: function(obj, target)
	{
		if(obj == null) return null;
		var r = JSON.parse( JSON.stringify( obj ) );
		if(!target) return r;

		for(var i in r)
			target[i] = r[i];
		return target;
	},

	isValidConnection: function( type_a, type_b )
	{
		if( !type_a ||  //generic output
			!type_b || //generic input
			type_a == type_b || //same type (is valid for triggers)
			type_a == LiteGraph.EVENT && type_b == LiteGraph.ACTION )
        return true;

		// Enforce string type to handle toLowerCase call (-1 number not ok)
		type_a = String(type_a); 
		type_b = String(type_b);
		type_a = type_a.toLowerCase();
		type_b = type_b.toLowerCase();

		// For nodes supporting multiple connection types
		if( type_a.indexOf(",") == -1 && type_b.indexOf(",") == -1 )
			return type_a == type_b;

		// Check all permutations to see if one is valid
		var supported_types_a = type_a.split(",");
		var supported_types_b = type_b.split(",");
		for(var i = 0; i < supported_types_a.length; ++i)
			for(var j = 0; j < supported_types_b.length; ++j)
				if( supported_types_a[i] == supported_types_b[j] )
					return true;

		return false;
	},

	registerSearchboxExtra: function( node_type, description, data )
	{
		this.searchbox_extras[ description ] = { type: node_type, desc: description, data: data };
	}
};

//timer that works everywhere
if(typeof(performance) != "undefined")
	LiteGraph.getTime = performance.now.bind(performance);
else if(typeof(Date) != "undefined" && Date.now)
	LiteGraph.getTime = Date.now.bind(Date);
else if(typeof(process) != "undefined")
	LiteGraph.getTime = function(){
		var t = process.hrtime();
		return t[0]*0.001 + t[1]*(1e-6);
	}
else
  LiteGraph.getTime = function getTime() { return (new Date).getTime(); }






//*********************************************************************************
// LGraph CLASS
//*********************************************************************************

/**
* LGraph is the class that contain a full graph. We instantiate one and add nodes to it, and then we can run the execution loop.
*
* @class LGraph
* @constructor
* @param {Object} o data from previous serialization [optional]
*/

function LGraph( o )
{
	if (LiteGraph.debug)
		console.log("Graph created");
	this.list_of_graphcanvas = null;
	this.clear();

	if(o)
		this.configure(o);
}

global.LGraph = LiteGraph.LGraph = LGraph;

//default supported types
LGraph.supported_types = ["number","string","boolean"];

//used to know which types of connections support this graph (some graphs do not allow certain types)
LGraph.prototype.getSupportedTypes = function() { return this.supported_types || LGraph.supported_types; }

LGraph.STATUS_STOPPED = 1;
LGraph.STATUS_RUNNING = 2;

/**
* Removes all nodes from this graph
* @method clear
*/

LGraph.prototype.clear = function()
{
	this.stop();
	this.status = LGraph.STATUS_STOPPED;

	this.last_node_id = 1;
	this.last_link_id = 1;

	this._version = -1; //used to detect changes

	//safe clear
	if(this._nodes)
	for(var i = 0; i < this._nodes.length; ++i)
	{
		var node = this._nodes[i];
		if(node.onRemoved)
			node.onRemoved();
	}

	//nodes
	this._nodes = [];
	this._nodes_by_id = {};
	this._nodes_in_order = []; //nodes that are executable sorted in execution order
	this._nodes_executable = null; //nodes that contain onExecute

	//other scene stuff
	this._groups = [];

	//links
	this.links = {}; //container with all the links

	//iterations
	this.iteration = 0;

	//custom data
	this.config = {};

	//timing
	this.globaltime = 0;
	this.runningtime = 0;
	this.fixedtime =  0;
	this.fixedtime_lapse = 0.01;
	this.elapsed_time = 0.01;
	this.last_update_time = 0;
	this.starttime = 0;

	this.catch_errors = true;

	//subgraph_data
	this.global_inputs = {};
	this.global_outputs = {};

	//notify canvas to redraw
	this.change();

	this.sendActionToCanvas("clear");
}

/**
* Attach Canvas to this graph
* @method attachCanvas
* @param {GraphCanvas} graph_canvas
*/

LGraph.prototype.attachCanvas = function(graphcanvas)
{
	if(graphcanvas.constructor != LGraphCanvas)
		throw("attachCanvas expects a LGraphCanvas instance");
	if(graphcanvas.graph && graphcanvas.graph != this)
		graphcanvas.graph.detachCanvas( graphcanvas );

	graphcanvas.graph = this;
	if(!this.list_of_graphcanvas)
		this.list_of_graphcanvas = [];
	this.list_of_graphcanvas.push(graphcanvas);
}

/**
* Detach Canvas from this graph
* @method detachCanvas
* @param {GraphCanvas} graph_canvas
*/
LGraph.prototype.detachCanvas = function(graphcanvas)
{
	if(!this.list_of_graphcanvas)
		return;

	var pos = this.list_of_graphcanvas.indexOf( graphcanvas );
	if(pos == -1)
		return;
	graphcanvas.graph = null;
	this.list_of_graphcanvas.splice(pos,1);
}

/**
* Starts running this graph every interval milliseconds.
* @method start
* @param {number} interval amount of milliseconds between executions, if 0 then it renders to the monitor refresh rate
*/

LGraph.prototype.start = function( interval )
{
	if( this.status == LGraph.STATUS_RUNNING )
		return;
	this.status = LGraph.STATUS_RUNNING;

	if(this.onPlayEvent)
		this.onPlayEvent();

	this.sendEventToAllNodes("onStart");

	//launch
	this.starttime = LiteGraph.getTime();
	this.last_update_time = this.starttime;
	interval = interval || 0;
	var that = this;

	if(interval == 0 && typeof(window) != "undefined" && window.requestAnimationFrame )
	{
		function on_frame()
		{
			if(that.execution_timer_id != -1)
				return;
			window.requestAnimationFrame(on_frame);
			that.runStep(1, !this.catch_errors );
		}
		this.execution_timer_id = -1;
		on_frame();
	}
	else
		this.execution_timer_id = setInterval( function() {
			//execute
			that.runStep(1, !this.catch_errors );
		},interval);
}

/**
* Stops the execution loop of the graph
* @method stop execution
*/

LGraph.prototype.stop = function()
{
	if( this.status == LGraph.STATUS_STOPPED )
		return;

	this.status = LGraph.STATUS_STOPPED;

	if(this.onStopEvent)
		this.onStopEvent();

	if(this.execution_timer_id != null)
	{
		if( this.execution_timer_id != -1 )
			clearInterval(this.execution_timer_id);
		this.execution_timer_id = null;
	}

	this.sendEventToAllNodes("onStop");
}

/**
* Run N steps (cycles) of the graph
* @method runStep
* @param {number} num number of steps to run, default is 1
*/

LGraph.prototype.runStep = function( num, do_not_catch_errors )
{
	num = num || 1;

	var start = LiteGraph.getTime();
	this.globaltime = 0.001 * (start - this.starttime);

	var nodes = this._nodes_executable ? this._nodes_executable : this._nodes;
	if(!nodes)
		return;

	if( do_not_catch_errors )
	{
		//iterations
		for(var i = 0; i < num; i++)
		{
			for( var j = 0, l = nodes.length; j < l; ++j )
			{
				var node = nodes[j];
				if( node.mode == LiteGraph.ALWAYS && node.onExecute )
					node.onExecute();
			}

			this.fixedtime += this.fixedtime_lapse;
			if( this.onExecuteStep )
				this.onExecuteStep();
		}

		if( this.onAfterExecute )
			this.onAfterExecute();
	}
	else
	{
		try
		{
			//iterations
			for(var i = 0; i < num; i++)
			{
				for( var j = 0, l = nodes.length; j < l; ++j )
				{
					var node = nodes[j];
					if( node.mode == LiteGraph.ALWAYS && node.onExecute )
						node.onExecute();
				}

				this.fixedtime += this.fixedtime_lapse;
				if( this.onExecuteStep )
					this.onExecuteStep();
			}

			if( this.onAfterExecute )
				this.onAfterExecute();
			this.errors_in_execution = false;
		}
		catch (err)
		{
			this.errors_in_execution = true;
			if(LiteGraph.throw_errors)
				throw err;
			if(LiteGraph.debug)
				console.log("Error during execution: " + err);
			this.stop();
		}
	}

	var now = LiteGraph.getTime();
	var elapsed = now - start;
	if (elapsed == 0)
		elapsed = 1;
	this.execution_time = 0.001 * elapsed;
	this.globaltime += 0.001 * elapsed;
	this.iteration += 1;
	this.elapsed_time = (now - this.last_update_time) * 0.001;
	this.last_update_time = now;
}

/**
* Updates the graph execution order according to relevance of the nodes (nodes with only outputs have more relevance than
* nodes with only inputs.
* @method updateExecutionOrder
*/
LGraph.prototype.updateExecutionOrder = function()
{
	this._nodes_in_order = this.computeExecutionOrder( false );
	this._nodes_executable = [];
	for(var i = 0; i < this._nodes_in_order.length; ++i)
		if( this._nodes_in_order[i].onExecute )
			this._nodes_executable.push( this._nodes_in_order[i] );
}

//This is more internal, it computes the order and returns it
LGraph.prototype.computeExecutionOrder = function( only_onExecute, set_level )
{
	var L = [];
	var S = [];
	var M = {};
	var visited_links = {}; //to avoid repeating links
	var remaining_links = {}; //to a

	//search for the nodes without inputs (starting nodes)
	for (var i = 0, l = this._nodes.length; i < l; ++i)
	{
		var node = this._nodes[i];
		if( only_onExecute && !node.onExecute )
			continue;

		M[node.id] = node; //add to pending nodes

		var num = 0; //num of input connections
		if(node.inputs)
			for(var j = 0, l2 = node.inputs.length; j < l2; j++)
				if(node.inputs[j] && node.inputs[j].link != null)
					num += 1;

		if(num == 0) //is a starting node
		{
			S.push(node);
			if(set_level)
				node._level = 1;
		}
		else //num of input links
		{
			if(set_level)
				node._level = 0;
			remaining_links[node.id] = num;
		}
	}

	while(true)
	{
		if(S.length == 0)
			break;

		//get an starting node
		var node = S.shift();
		L.push(node); //add to ordered list
		delete M[node.id]; //remove from the pending nodes

		if(!node.outputs)
			continue;

		//for every output
		for(var i = 0; i < node.outputs.length; i++)
		{
			var output = node.outputs[i];
			//not connected
			if(output == null || output.links == null || output.links.length == 0)
				continue;

			//for every connection
			for(var j = 0; j < output.links.length; j++)
			{
				var link_id = output.links[j];
				var link = this.links[link_id];
				if(!link)
					continue;

				//already visited link (ignore it)
				if(visited_links[ link.id ])
					continue;

				var target_node = this.getNodeById( link.target_id );
				if(target_node == null)
				{
					visited_links[ link.id ] = true;
					continue;
				}

				if(set_level && (!target_node._level || target_node._level <= node._level))
					target_node._level = node._level + 1;

				visited_links[link.id] = true; //mark as visited
				remaining_links[target_node.id] -= 1; //reduce the number of links remaining
				if (remaining_links[ target_node.id ] == 0)
					S.push(target_node); //if no more links, then add to starters array
			}
		}
	}

	//the remaining ones (loops)
	for(var i in M)
		L.push( M[i] );

	if( L.length != this._nodes.length && LiteGraph.debug )
		console.warn("something went wrong, nodes missing");

	var l = L.length;

	//save order number in the node
	for(var i = 0; i < l; ++i)
		L[i].order = i;

	//sort now by priority
	L = L.sort(function(A,B){ 
		var Ap = A.constructor.priority || A.priority || 0;
		var Bp = B.constructor.priority || B.priority || 0;
		if(Ap == Bp)
			return A.order - B.order;
		return Ap - Bp;
	});

	//save order number in the node, again...
	for(var i = 0; i < l; ++i)
		L[i].order = i;

	return L;
}

/**
* Returns all the nodes that could affect this one (ancestors) by crawling all the inputs recursively.
* It doesnt include the node itself
* @method getAncestors
* @return {Array} an array with all the LGraphNodes that affect this node, in order of execution
*/
LGraph.prototype.getAncestors = function( node )
{
	var ancestors = [];
	var pending = [node];
	var visited = {};

	while (pending.length)
	{
		var current = pending.shift();
		if(!current.inputs)
			continue;
		if( !visited[ current.id ] && current != node )
		{
			visited[ current.id ] = true;
			ancestors.push( current );
		}

		for(var i = 0; i < current.inputs.length;++i)
		{
			var input = current.getInputNode(i);
			if( input && ancestors.indexOf( input ) == -1)
			{
				pending.push( input );
			}
		}
	}

	ancestors.sort(function(a,b){ return a.order - b.order;});
	return ancestors;
}

/**
* Positions every node in a more readable manner
* @method arrange
*/
LGraph.prototype.arrange = function( margin )
{
	margin = margin || 40;

	var nodes = this.computeExecutionOrder( false, true );
	var columns = [];
	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		var col = node._level || 1;
		if(!columns[col])
			columns[col] = [];
		columns[col].push( node );
	}

	var x = margin;

	for(var i = 0; i < columns.length; ++i)
	{
		var column = columns[i];
		if(!column)
			continue;
		var max_size = 100;
		var y = margin;
		for(var j = 0; j < column.length; ++j)
		{
			var node = column[j];
			node.pos[0] = x;
			node.pos[1] = y;
			if(node.size[0] > max_size)
				max_size = node.size[0];
			y += node.size[1] + margin;
		}
		x += max_size + margin;
	}

	this.setDirtyCanvas(true,true);
}


/**
* Returns the amount of time the graph has been running in milliseconds
* @method getTime
* @return {number} number of milliseconds the graph has been running
*/
LGraph.prototype.getTime = function()
{
	return this.globaltime;
}

/**
* Returns the amount of time accumulated using the fixedtime_lapse var. This is used in context where the time increments should be constant
* @method getFixedTime
* @return {number} number of milliseconds the graph has been running
*/

LGraph.prototype.getFixedTime = function()
{
	return this.fixedtime;
}

/**
* Returns the amount of time it took to compute the latest iteration. Take into account that this number could be not correct
* if the nodes are using graphical actions
* @method getElapsedTime
* @return {number} number of milliseconds it took the last cycle
*/

LGraph.prototype.getElapsedTime = function()
{
	return this.elapsed_time;
}

/**
* Sends an event to all the nodes, useful to trigger stuff
* @method sendEventToAllNodes
* @param {String} eventname the name of the event (function to be called)
* @param {Array} params parameters in array format
*/

LGraph.prototype.sendEventToAllNodes = function( eventname, params, mode )
{
	mode = mode || LiteGraph.ALWAYS;

	var nodes = this._nodes_in_order ? this._nodes_in_order : this._nodes;
	if(!nodes)
		return;

	for( var j = 0, l = nodes.length; j < l; ++j )
	{
		var node = nodes[j];
		if(node[eventname] && node.mode == mode )
		{
			if(params === undefined)
				node[eventname]();
			else if(params && params.constructor === Array)
				node[eventname].apply( node, params );
			else
				node[eventname](params);
		}
	}
}

LGraph.prototype.sendActionToCanvas = function(action, params)
{
	if(!this.list_of_graphcanvas)
		return;

	for(var i = 0; i < this.list_of_graphcanvas.length; ++i)
	{
		var c = this.list_of_graphcanvas[i];
		if( c[action] )
			c[action].apply(c, params);
	}
}

/**
* Adds a new node instasnce to this graph
* @method add
* @param {LGraphNode} node the instance of the node
*/

LGraph.prototype.add = function( node, skip_compute_order)
{
	if(!node)
		return;

	//groups
	if( node.constructor === LGraphGroup )
	{
		this._groups.push( node );
		this.setDirtyCanvas(true);
		this.change();
		node.graph = this;
		this._version++;
		return;
	}

	//nodes
	if(node.id != -1 && this._nodes_by_id[node.id] != null)
	{
		console.warn("LiteGraph: there is already a node with this ID, changing it");
		node.id = ++this.last_node_id;
	}

	if(this._nodes.length >= LiteGraph.MAX_NUMBER_OF_NODES)
		throw("LiteGraph: max number of nodes in a graph reached");

	//give him an id
	if(node.id == null || node.id == -1)
		node.id = ++this.last_node_id;
	else if (this.last_node_id < node.id)
		this.last_node_id = node.id;


	node.graph = this;
	this._version++;

	this._nodes.push(node);
	this._nodes_by_id[node.id] = node;

	if(node.onAdded)
		node.onAdded( this );

	if(this.config.align_to_grid)
		node.alignToGrid();

	if(!skip_compute_order)
		this.updateExecutionOrder();

	if(this.onNodeAdded)
		this.onNodeAdded(node);


	this.setDirtyCanvas(true);
	this.change();

	return node; //to chain actions
}

/**
* Removes a node from the graph
* @method remove
* @param {LGraphNode} node the instance of the node
*/

LGraph.prototype.remove = function(node)
{
	if(node.constructor === LiteGraph.LGraphGroup)
	{
		var index = this._groups.indexOf(node);
		if(index != -1)
			this._groups.splice(index,1);
		node.graph = null;
		this._version++;
		this.setDirtyCanvas(true,true);
		this.change();
		return;
	}

	if(this._nodes_by_id[node.id] == null)
		return; //not found

	if(node.ignore_remove)
		return; //cannot be removed

	//disconnect inputs
	if(node.inputs)
		for(var i = 0; i < node.inputs.length; i++)
		{
			var slot = node.inputs[i];
			if(slot.link != null)
				node.disconnectInput(i);
		}

	//disconnect outputs
	if(node.outputs)
		for(var i = 0; i < node.outputs.length; i++)
		{
			var slot = node.outputs[i];
			if(slot.links != null && slot.links.length)
				node.disconnectOutput(i);
		}

	//node.id = -1; //why?

	//callback
	if(node.onRemoved)
		node.onRemoved();

	node.graph = null;
	this._version++;

	//remove from canvas render
	if(this.list_of_graphcanvas)
	{
		for(var i = 0; i < this.list_of_graphcanvas.length; ++i)
		{
			var canvas = this.list_of_graphcanvas[i];
			if(canvas.selected_nodes[node.id])
				delete canvas.selected_nodes[node.id];
			if(canvas.node_dragged == node)
				canvas.node_dragged = null;
		}
	}

	//remove from containers
	var pos = this._nodes.indexOf(node);
	if(pos != -1)
		this._nodes.splice(pos,1);
	delete this._nodes_by_id[node.id];

	if(this.onNodeRemoved)
		this.onNodeRemoved(node);

	this.setDirtyCanvas(true,true);
	this.change();

	this.updateExecutionOrder();
}

/**
* Returns a node by its id.
* @method getNodeById
* @param {Number} id
*/

LGraph.prototype.getNodeById = function( id )
{
	if( id == null )
		return null;
	return this._nodes_by_id[ id ];
}

/**
* Returns a list of nodes that matches a class
* @method findNodesByClass
* @param {Class} classObject the class itself (not an string)
* @return {Array} a list with all the nodes of this type
*/

LGraph.prototype.findNodesByClass = function(classObject)
{
	var r = [];
	for(var i = 0, l = this._nodes.length; i < l; ++i)
		if(this._nodes[i].constructor === classObject)
			r.push(this._nodes[i]);
	return r;
}

/**
* Returns a list of nodes that matches a type
* @method findNodesByType
* @param {String} type the name of the node type
* @return {Array} a list with all the nodes of this type
*/

LGraph.prototype.findNodesByType = function(type)
{
	var type = type.toLowerCase();
	var r = [];
	for(var i = 0, l = this._nodes.length; i < l; ++i)
		if(this._nodes[i].type.toLowerCase() == type )
			r.push(this._nodes[i]);
	return r;
}

/**
* Returns a list of nodes that matches a name
* @method findNodesByTitle
* @param {String} name the name of the node to search
* @return {Array} a list with all the nodes with this name
*/

LGraph.prototype.findNodesByTitle = function(title)
{
	var result = [];
	for(var i = 0, l = this._nodes.length; i < l; ++i)
		if(this._nodes[i].title == title)
			result.push(this._nodes[i]);
	return result;
}

/**
* Returns the top-most node in this position of the canvas
* @method getNodeOnPos
* @param {number} x the x coordinate in canvas space
* @param {number} y the y coordinate in canvas space
* @param {Array} nodes_list a list with all the nodes to search from, by default is all the nodes in the graph
* @return {LGraphNode} the node at this position or null
*/
LGraph.prototype.getNodeOnPos = function( x, y, nodes_list, margin )
{
	nodes_list = nodes_list || this._nodes;
	for (var i = nodes_list.length - 1; i >= 0; i--)
	{
		var n = nodes_list[i];
		if(n.isPointInside( x, y, margin ))
			return n;
	}
	return null;
}

/**
* Returns the top-most group in that position
* @method getGroupOnPos
* @param {number} x the x coordinate in canvas space
* @param {number} y the y coordinate in canvas space
* @return {LGraphGroup} the group or null
*/
LGraph.prototype.getGroupOnPos = function(x,y)
{
	for (var i = this._groups.length - 1; i >= 0; i--)
	{
		var g = this._groups[i];
		if(g.isPointInside( x, y, 2, true ))
			return g;
	}
	return null;
}

// ********** GLOBALS *****************

/**
* Tell this graph it has a global graph input of this type
* @method addGlobalInput
* @param {String} name
* @param {String} type
* @param {*} value [optional]
*/
LGraph.prototype.addGlobalInput = function(name, type, value)
{
	this.global_inputs[name] = { name: name, type: type, value: value };
	this._version++;

	if(this.onGlobalInputAdded)
		this.onGlobalInputAdded(name, type);

	if(this.onGlobalsChange)
		this.onGlobalsChange();
}

/**
* Assign a data to the global graph input
* @method setGlobalInputData
* @param {String} name
* @param {*} data
*/
LGraph.prototype.setGlobalInputData = function(name, data)
{
	var input = this.global_inputs[name];
	if (!input)
		return;
	input.value = data;
}

/**
* Assign a data to the global graph input (same as setGlobalInputData)
* @method setInputData
* @param {String} name
* @param {*} data
*/
LGraph.prototype.setInputData = LGraph.prototype.setGlobalInputData;


/**
* Returns the current value of a global graph input
* @method getGlobalInputData
* @param {String} name
* @return {*} the data
*/
LGraph.prototype.getGlobalInputData = function(name)
{
	var input = this.global_inputs[name];
	if (!input)
		return null;
	return input.value;
}

/**
* Changes the name of a global graph input
* @method renameGlobalInput
* @param {String} old_name
* @param {String} new_name
*/
LGraph.prototype.renameGlobalInput = function(old_name, name)
{
	if(name == old_name)
		return;

	if(!this.global_inputs[old_name])
		return false;

	if(this.global_inputs[name])
	{
		console.error("there is already one input with that name");
		return false;
	}

	this.global_inputs[name] = this.global_inputs[old_name];
	delete this.global_inputs[old_name];
	this._version++;

	if(this.onGlobalInputRenamed)
		this.onGlobalInputRenamed(old_name, name);

	if(this.onGlobalsChange)
		this.onGlobalsChange();
}

/**
* Changes the type of a global graph input
* @method changeGlobalInputType
* @param {String} name
* @param {String} type
*/
LGraph.prototype.changeGlobalInputType = function(name, type)
{
	if(!this.global_inputs[name])
		return false;

	if(this.global_inputs[name].type && this.global_inputs[name].type.toLowerCase() == type.toLowerCase() )
		return;

	this.global_inputs[name].type = type;
	this._version++;
	if(this.onGlobalInputTypeChanged)
		this.onGlobalInputTypeChanged(name, type);
}

/**
* Removes a global graph input
* @method removeGlobalInput
* @param {String} name
* @param {String} type
*/
LGraph.prototype.removeGlobalInput = function(name)
{
	if(!this.global_inputs[name])
		return false;

	delete this.global_inputs[name];
	this._version++;

	if(this.onGlobalInputRemoved)
		this.onGlobalInputRemoved(name);

	if(this.onGlobalsChange)
		this.onGlobalsChange();
	return true;
}

/**
* Creates a global graph output
* @method addGlobalOutput
* @param {String} name
* @param {String} type
* @param {*} value
*/
LGraph.prototype.addGlobalOutput = function(name, type, value)
{
	this.global_outputs[name] = { name: name, type: type, value: value };
	this._version++;

	if(this.onGlobalOutputAdded)
		this.onGlobalOutputAdded(name, type);

	if(this.onGlobalsChange)
		this.onGlobalsChange();
}

/**
* Assign a data to the global output
* @method setGlobalOutputData
* @param {String} name
* @param {String} value
*/
LGraph.prototype.setGlobalOutputData = function(name, value)
{
	var output = this.global_outputs[ name ];
	if (!output)
		return;
	output.value = value;
}

/**
* Returns the current value of a global graph output
* @method getGlobalOutputData
* @param {String} name
* @return {*} the data
*/
LGraph.prototype.getGlobalOutputData = function(name)
{
	var output = this.global_outputs[name];
	if (!output)
		return null;
	return output.value;
}

/**
* Returns the current value of a global graph output (sames as getGlobalOutputData)
* @method getOutputData
* @param {String} name
* @return {*} the data
*/
LGraph.prototype.getOutputData = LGraph.prototype.getGlobalOutputData;


/**
* Renames a global graph output
* @method renameGlobalOutput
* @param {String} old_name
* @param {String} new_name
*/
LGraph.prototype.renameGlobalOutput = function(old_name, name)
{
	if(!this.global_outputs[old_name])
		return false;

	if(this.global_outputs[name])
	{
		console.error("there is already one output with that name");
		return false;
	}

	this.global_outputs[name] = this.global_outputs[old_name];
	delete this.global_outputs[old_name];
	this._version++;

	if(this.onGlobalOutputRenamed)
		this.onGlobalOutputRenamed(old_name, name);

	if(this.onGlobalsChange)
		this.onGlobalsChange();
}

/**
* Changes the type of a global graph output
* @method changeGlobalOutputType
* @param {String} name
* @param {String} type
*/
LGraph.prototype.changeGlobalOutputType = function(name, type)
{
	if(!this.global_outputs[name])
		return false;

	if(this.global_outputs[name].type && this.global_outputs[name].type.toLowerCase() == type.toLowerCase() )
		return;

	this.global_outputs[name].type = type;
	this._version++;
	if(this.onGlobalOutputTypeChanged)
		this.onGlobalOutputTypeChanged(name, type);
}

/**
* Removes a global graph output
* @method removeGlobalOutput
* @param {String} name
*/
LGraph.prototype.removeGlobalOutput = function(name)
{
	if(!this.global_outputs[name])
		return false;
	delete this.global_outputs[name];
	this._version++;

	if(this.onGlobalOutputRemoved)
		this.onGlobalOutputRemoved(name);

	if(this.onGlobalsChange)
		this.onGlobalsChange();
	return true;
}

LGraph.prototype.triggerInput = function(name,value)
{
	var nodes = this.findNodesByTitle(name);
	for(var i = 0; i < nodes.length; ++i)
		nodes[i].onTrigger(value);
}

LGraph.prototype.setCallback = function(name,func)
{
	var nodes = this.findNodesByTitle(name);
	for(var i = 0; i < nodes.length; ++i)
		nodes[i].setTrigger(func);
}


LGraph.prototype.connectionChange = function( node, link_info )
{
	this.updateExecutionOrder();
	if( this.onConnectionChange )
		this.onConnectionChange( node );
	this._version++;
	this.sendActionToCanvas("onConnectionChange");
}

/**
* returns if the graph is in live mode
* @method isLive
*/

LGraph.prototype.isLive = function()
{
	if(!this.list_of_graphcanvas)
		return false;

	for(var i = 0; i < this.list_of_graphcanvas.length; ++i)
	{
		var c = this.list_of_graphcanvas[i];
		if(c.live_mode)
			return true;
	}
	return false;
}

/**
* clears the triggered slot animation in all links (stop visual animation)
* @method clearTriggeredSlots
*/
LGraph.prototype.clearTriggeredSlots = function()
{
	for(var i in this.links)
	{
		var link_info = this.links[i];
		if( !link_info )
			continue;
		if( link_info._last_time )
			link_info._last_time = 0;
	}
}


/* Called when something visually changed (not the graph!) */
LGraph.prototype.change = function()
{
	if(LiteGraph.debug)
		console.log("Graph changed");
	this.sendActionToCanvas("setDirty",[true,true]);
	if(this.on_change)
		this.on_change(this);
}

LGraph.prototype.setDirtyCanvas = function(fg,bg)
{
	this.sendActionToCanvas("setDirty",[fg,bg]);
}

/**
* Destroys a link
* @method removeLink
* @param {Number} link_id
*/
LGraph.prototype.removeLink = function(link_id)
{
	var link = this.links[ link_id ];
	if(!link)
		return;
	var node = this.getNodeById( link.target_id );
	if(node)
		node.disconnectInput( link.target_slot );
}


//save and recover app state ***************************************
/**
* Creates a Object containing all the info about this graph, it can be serialized
* @method serialize
* @return {Object} value of the node
*/
LGraph.prototype.serialize = function()
{
	var nodes_info = [];
	for(var i = 0, l = this._nodes.length; i < l; ++i)
		nodes_info.push( this._nodes[i].serialize() );

	//pack link info into a non-verbose format
	var links = [];
	for(var i in this.links) //links is an OBJECT
	{
		var link = this.links[i];
		links.push([ link.id, link.origin_id, link.origin_slot, link.target_id, link.target_slot, link.type ]);
	}

	var groups_info = [];
	for(var i = 0; i < this._groups.length; ++i)
		groups_info.push( this._groups[i].serialize() );

	var data = {
		last_node_id: this.last_node_id,
		last_link_id: this.last_link_id,
		nodes: nodes_info,
		links: links, 
		groups: groups_info,
		config: this.config
	};

	return data;
}


/**
* Configure a graph from a JSON string
* @method configure
* @param {String} str configure a graph from a JSON string
* @param {Boolean} returns if there was any error parsing
*/
LGraph.prototype.configure = function( data, keep_old )
{
	if(!data)
		return;

	if(!keep_old)
		this.clear();

	var nodes = data.nodes;

	//decode links info (they are very verbose)
	if(data.links && data.links.constructor === Array)
	{
		var links = [];
		for(var i = 0; i < data.links.length; ++i)
		{
			var link_data = data.links[i];
			var link = new LLink();
			link.configure( link_data );
			links[ link.id ] = link;
		}
		data.links = links;
	}

	//copy all stored fields
	for (var i in data)
		this[i] = data[i];

	var error = false;

	//create nodes
	this._nodes = [];
	if(nodes)
	{
		for(var i = 0, l = nodes.length; i < l; ++i)
		{
			var n_info = nodes[i]; //stored info
			var node = LiteGraph.createNode( n_info.type, n_info.title );
			if(!node)
			{
				if(LiteGraph.debug)
					console.log("Node not found or has errors: " + n_info.type);

				//in case of error we create a replacement node to avoid losing info
				node = new LGraphNode();
				node.last_serialization = n_info;
				node.has_errors = true;
				error = true;
				//continue;
			}

			node.id = n_info.id; //id it or it will create a new id
			this.add(node, true); //add before configure, otherwise configure cannot create links
		}

		//configure nodes afterwards so they can reach each other
		for(var i = 0, l = nodes.length; i < l; ++i)
		{
			var n_info = nodes[i];
			var node = this.getNodeById( n_info.id );
			if(node)
				node.configure( n_info );
		}
	}

	//groups
	this._groups.length = 0;
	if( data.groups )
	for(var i = 0; i < data.groups.length; ++i )
	{
		var group = new LiteGraph.LGraphGroup();
		group.configure( data.groups[i] );
		this.add( group );
	}

	this.updateExecutionOrder();
	this._version++;
	this.setDirtyCanvas(true,true);
	return error;
}

LGraph.prototype.load = function(url)
{
	var that = this;
	var req = new XMLHttpRequest();
	req.open('GET', url, true);
	req.send(null);
	req.onload = function (oEvent) {
		if(req.status !== 200)
		{
			console.error("Error loading graph:",req.status,req.response);
			return;
		}
		var data = JSON.parse( req.response );
		that.configure(data);
	}
	req.onerror = function(err)
	{
		console.error("Error loading graph:",err);
	}
}

LGraph.prototype.onNodeTrace = function(node, msg, color)
{
	//TODO
}

//this is the class in charge of storing link information
function LLink( id, type, origin_id, origin_slot, target_id, target_slot )
{
	this.id = id;
	this.type = type;
	this.origin_id = origin_id;
	this.origin_slot = origin_slot;
	this.target_id = target_id;
	this.target_slot = target_slot;

	this._data = null;
	this._pos = new Float32Array(2); //center
}

LLink.prototype.configure = function(o)
{
	if(o.constructor === Array)
	{
		this.id = o[0];
		this.origin_id = o[1];
		this.origin_slot = o[2];
		this.target_id = o[3];
		this.target_slot = o[4];
		this.type = o[5];
	}
	else
	{
		this.id = o.id;
		this.type = o.type;
		this.origin_id = o.origin_id;
		this.origin_slot = o.origin_slot;
		this.target_id = o.target_id;
		this.target_slot = o.target_slot;
	}
}

LLink.prototype.serialize = function()
{
	return [ this.id, this.type, this.origin_id, this.origin_slot, this.target_id, this.target_slot ];
}

LiteGraph.LLink = LLink;

// *************************************************************
//   Node CLASS                                          *******
// *************************************************************

/*
	title: string
	pos: [x,y]
	size: [x,y]

	input|output: every connection
		+  { name:string, type:string, pos: [x,y]=Optional, direction: "input"|"output", links: Array });

	general properties:
		+ clip_area: if you render outside the node, it will be cliped
		+ unsafe_execution: not allowed for safe execution
		+ skip_repeated_outputs: when adding new outputs, it wont show if there is one already connected
		+ resizable: if set to false it wont be resizable with the mouse
		+ horizontal: slots are distributed horizontally
		+ widgets_up: widgets start from the top of the node
	
	flags object:
		+ collapsed: if it is collapsed

	supported callbacks:
		+ onAdded: when added to graph
		+ onRemoved: when removed from graph
		+ onStart:	when the graph starts playing
		+ onStop:	when the graph stops playing
		+ onDrawForeground: render the inside widgets inside the node
		+ onDrawBackground: render the background area inside the node (only in edit mode)
		+ onMouseDown
		+ onMouseMove
		+ onMouseUp
		+ onMouseEnter
		+ onMouseLeave
		+ onExecute: execute the node
		+ onPropertyChanged: when a property is changed in the panel (return true to skip default behaviour)
		+ onGetInputs: returns an array of possible inputs
		+ onGetOutputs: returns an array of possible outputs
		+ onBounding: in case this node has a bigger bounding than the node itself (the callback receives the bounding as [x,y,w,h])
		+ onDblClick: double clicked in the node
		+ onInputDblClick: input slot double clicked (can be used to automatically create a node connected)
		+ onOutputDblClick: output slot double clicked (can be used to automatically create a node connected)
		+ onSerialize: to add extra info when serializing (the callback receives the object that should be filled with the data)
		+ onSelected
		+ onDeselected
		+ onDropItem : DOM item dropped over the node
		+ onDropFile : file dropped over the node
		+ onConnectInput : if returns false the incoming connection will be canceled
		+ onConnectionsChange : a connection changed (new one or removed) (LiteGraph.INPUT or LiteGraph.OUTPUT, slot, true if connected, link_info, input_info )
*/

/**
* Base Class for all the node type classes
* @class LGraphNode
* @param {String} name a name for the node
*/

function LGraphNode(title)
{
	this._ctor(title);
}

global.LGraphNode = LiteGraph.LGraphNode = LGraphNode;

LGraphNode.prototype._ctor = function( title )
{
	this.title = title || "Unnamed";
	this.size = [LiteGraph.NODE_WIDTH,60];
	this.graph = null;

	this._pos = new Float32Array(10,10);

	Object.defineProperty( this, "pos", {
		set: function(v)
		{
			if(!v || v.length < 2)
				return;
			this._pos[0] = v[0];
			this._pos[1] = v[1];
		},
		get: function()
		{
			return this._pos;
		},
		enumerable: true
	});

	this.id = -1; //not know till not added
	this.type = null;

	//inputs available: array of inputs
	this.inputs = [];
	this.outputs = [];
	this.connections = [];

	//local data
	this.properties = {}; //for the values
	this.properties_info = []; //for the info

	this.flags = {};
}

/**
* configure a node from an object containing the serialized info
* @method configure
*/
LGraphNode.prototype.configure = function(info)
{
	if(this.graph)
		this.graph._version++;

	for (var j in info)
	{
		if(j == "properties")
		{
			//i dont want to clone properties, I want to reuse the old container
			for(var k in info.properties)
			{
				this.properties[k] = info.properties[k];
				if(this.onPropertyChanged)
					this.onPropertyChanged(k,info.properties[k]);
			}
			continue;
		}

		if(info[j] == null)
			continue;

		else if (typeof(info[j]) == 'object') //object
		{
			if(this[j] && this[j].configure)
				this[j].configure( info[j] );
			else
				this[j] = LiteGraph.cloneObject(info[j], this[j]);
		}
		else //value
			this[j] = info[j];
	}

	if(!info.title)
		this.title = this.constructor.title;

	if(this.onConnectionsChange)
	{
		if(this.inputs)
		for(var i = 0; i < this.inputs.length; ++i)
		{
			var input = this.inputs[i];
			var link_info = this.graph ? this.graph.links[ input.link ] : null;
			this.onConnectionsChange( LiteGraph.INPUT, i, true, link_info, input ); //link_info has been created now, so its updated
		}

		if(this.outputs)
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			if(!output.links)
				continue;
			for(var j = 0; j < output.links.length; ++j)
			{
				var link_info = this.graph ? this.graph.links[ output.links[j] ] : null;
				this.onConnectionsChange( LiteGraph.OUTPUT, i, true, link_info, output ); //link_info has been created now, so its updated
			}
		}
	}

	if( this.onConfigure )
		this.onConfigure( info );
}

/**
* serialize the content
* @method serialize
*/

LGraphNode.prototype.serialize = function()
{
	//create serialization object
	var o = {
		id: this.id,
		type: this.type,
		pos: this.pos,
		size: this.size,
		flags: LiteGraph.cloneObject(this.flags),
		mode: this.mode
	};

	//special case for when there were errors
	if( this.constructor === LGraphNode && this.last_serialization )
		return this.last_serialization;

	if( this.inputs )
		o.inputs = this.inputs;

	if( this.outputs )
	{
		//clear outputs last data (because data in connections is never serialized but stored inside the outputs info)
		for(var i = 0; i < this.outputs.length; i++)
			delete this.outputs[i]._data;
		o.outputs = this.outputs;
	}

	if( this.title && this.title != this.constructor.title )
		o.title = this.title;

	if( this.properties )
		o.properties = LiteGraph.cloneObject( this.properties );

	if( !o.type )
		o.type = this.constructor.type;

	if( this.color )
		o.color = this.color;
	if( this.bgcolor )
		o.bgcolor = this.bgcolor;
	if( this.boxcolor )
		o.boxcolor = this.boxcolor;
	if( this.shape )
		o.shape = this.shape;

	if(this.onSerialize)
	{
		if( this.onSerialize(o) )
			console.warn("node onSerialize shouldnt return anything, data should be stored in the object pass in the first parameter");
	}

	return o;
}


/* Creates a clone of this node */
LGraphNode.prototype.clone = function()
{
	var node = LiteGraph.createNode(this.type);
	if(!node)
		return null;

	//we clone it because serialize returns shared containers
	var data = LiteGraph.cloneObject( this.serialize() );

	//remove links
	if(data.inputs)
		for(var i = 0; i < data.inputs.length; ++i)
			data.inputs[i].link = null;

	if(data.outputs)
		for(var i = 0; i < data.outputs.length; ++i)
		{
			if(data.outputs[i].links)
				data.outputs[i].links.length = 0;
		}

	delete data["id"];
	//remove links
	node.configure(data);

	return node;
}


/**
* serialize and stringify
* @method toString
*/

LGraphNode.prototype.toString = function()
{
	return JSON.stringify( this.serialize() );
}
//LGraphNode.prototype.unserialize = function(info) {} //this cannot be done from within, must be done in LiteGraph


/**
* get the title string
* @method getTitle
*/

LGraphNode.prototype.getTitle = function()
{
	return this.title || this.constructor.title;
}



// Execution *************************
/**
* sets the output data
* @method setOutputData
* @param {number} slot
* @param {*} data
*/
LGraphNode.prototype.setOutputData = function(slot, data)
{
	if(!this.outputs)
		return;

	//this maybe slow and a niche case
	//if(slot && slot.constructor === String)
	//	slot = this.findOutputSlot(slot);

	if(slot == -1 || slot >= this.outputs.length)
		return;

	var output_info = this.outputs[slot];
	if(!output_info)
		return;

	//store data in the output itself in case we want to debug
	output_info._data = data;

	//if there are connections, pass the data to the connections
	if( this.outputs[slot].links )
	{
		for(var i = 0; i < this.outputs[slot].links.length; i++)
		{
			var link_id = this.outputs[slot].links[i];
			this.graph.links[ link_id ].data = data;
		}
	}
}

/**
* Retrieves the input data (data traveling through the connection) from one slot
* @method getInputData
* @param {number} slot
* @param {boolean} force_update if set to true it will force the connected node of this slot to output data into this link
* @return {*} data or if it is not connected returns undefined
*/
LGraphNode.prototype.getInputData = function( slot, force_update )
{
	if(!this.inputs)
		return; //undefined;

	if(slot >= this.inputs.length || this.inputs[slot].link == null)
		return;

	var link_id = this.inputs[slot].link;
	var link = this.graph.links[ link_id ];
	if(!link) //bug: weird case but it happens sometimes
		return null;

	if(!force_update)
		return link.data;

	//special case: used to extract data from the incomming connection before the graph has been executed
	var node = this.graph.getNodeById( link.origin_id );
	if(!node)
		return link.data;

	if(node.updateOutputData)
		node.updateOutputData( link.origin_slot );
	else if(node.onExecute)
		node.onExecute();

	return link.data;
}

/**
* Retrieves the input data from one slot using its name instead of slot number
* @method getInputDataByName
* @param {String} slot_name
* @param {boolean} force_update if set to true it will force the connected node of this slot to output data into this link
* @return {*} data or if it is not connected returns null
*/
LGraphNode.prototype.getInputDataByName = function( slot_name, force_update )
{
	var slot = this.findInputSlot( slot_name );
	if( slot == -1 )
		return null;
	return this.getInputData( slot, force_update );
}


/**
* tells you if there is a connection in one input slot
* @method isInputConnected
* @param {number} slot
* @return {boolean}
*/
LGraphNode.prototype.isInputConnected = function(slot)
{
	if(!this.inputs)
		return false;
	return (slot < this.inputs.length && this.inputs[slot].link != null);
}

/**
* tells you info about an input connection (which node, type, etc)
* @method getInputInfo
* @param {number} slot
* @return {Object} object or null { link: id, name: string, type: string or 0 }
*/
LGraphNode.prototype.getInputInfo = function(slot)
{
	if(!this.inputs)
		return null;
	if(slot < this.inputs.length)
		return this.inputs[slot];
	return null;
}

/**
* returns the node connected in the input slot
* @method getInputNode
* @param {number} slot
* @return {LGraphNode} node or null
*/
LGraphNode.prototype.getInputNode = function( slot )
{
	if(!this.inputs)
		return null;
	if(slot >= this.inputs.length)
		return null;
	var input = this.inputs[slot];
	if(!input || input.link === null)
		return null;
	var link_info = this.graph.links[ input.link ];
	if(!link_info)
		return null;
	return this.graph.getNodeById( link_info.origin_id );
}


/**
* returns the value of an input with this name, otherwise checks if there is a property with that name
* @method getInputOrProperty
* @param {string} name
* @return {*} value
*/
LGraphNode.prototype.getInputOrProperty = function( name )
{
	if(!this.inputs || !this.inputs.length)
		return this.properties ? this.properties[name] : null;

	for(var i = 0, l = this.inputs.length; i < l; ++i)
	{
		var input_info = this.inputs[i];
		if(name == input_info.name && input_info.link != null)
		{
			var link = this.graph.links[ input_info.link ];
			if(link)
				return link.data;
		}
	}
	return this.properties[ name ];
}




/**
* tells you the last output data that went in that slot
* @method getOutputData
* @param {number} slot
* @return {Object}  object or null
*/
LGraphNode.prototype.getOutputData = function(slot)
{
	if(!this.outputs)
		return null;
	if(slot >= this.outputs.length)
		return null;

	var info = this.outputs[slot];
	return info._data;
}


/**
* tells you info about an output connection (which node, type, etc)
* @method getOutputInfo
* @param {number} slot
* @return {Object}  object or null { name: string, type: string, links: [ ids of links in number ] }
*/
LGraphNode.prototype.getOutputInfo = function(slot)
{
	if(!this.outputs)
		return null;
	if(slot < this.outputs.length)
		return this.outputs[slot];
	return null;
}


/**
* tells you if there is a connection in one output slot
* @method isOutputConnected
* @param {number} slot
* @return {boolean}
*/
LGraphNode.prototype.isOutputConnected = function(slot)
{
	if(!this.outputs)
		return false;
	return (slot < this.outputs.length && this.outputs[slot].links && this.outputs[slot].links.length);
}

/**
* tells you if there is any connection in the output slots
* @method isAnyOutputConnected
* @return {boolean}
*/
LGraphNode.prototype.isAnyOutputConnected = function()
{
	if(!this.outputs)
		return false;
	for(var i = 0; i < this.outputs.length; ++i)
		if( this.outputs[i].links && this.outputs[i].links.length )
			return true;
	return false;
}


/**
* retrieves all the nodes connected to this output slot
* @method getOutputNodes
* @param {number} slot
* @return {array}
*/
LGraphNode.prototype.getOutputNodes = function(slot)
{
	if(!this.outputs || this.outputs.length == 0)
		return null;

	if(slot >= this.outputs.length)
		return null;

	var output = this.outputs[slot];
	if(!output.links || output.links.length == 0)
		return null;

	var r = [];
	for(var i = 0; i < output.links.length; i++)
	{
		var link_id = output.links[i];
		var link = this.graph.links[ link_id ];
		if(link)
		{
			var target_node = this.graph.getNodeById( link.target_id );
			if( target_node )
				r.push( target_node );
		}
	}
	return r;
}

/**
* Triggers an event in this node, this will trigger any output with the same name
* @method trigger
* @param {String} event name ( "on_play", ... ) if action is equivalent to false then the event is send to all
* @param {*} param
*/
LGraphNode.prototype.trigger = function( action, param )
{
	if( !this.outputs || !this.outputs.length )
		return;

	if(this.graph)
		this.graph._last_trigger_time = LiteGraph.getTime();

	for(var i = 0; i < this.outputs.length; ++i)
	{
		var output = this.outputs[ i ];
		if(!output || output.type !== LiteGraph.EVENT || (action && output.name != action) )
			continue;
		this.triggerSlot( i, param );
	}
}

/**
* Triggers an slot event in this node
* @method triggerSlot
* @param {Number} slot the index of the output slot
* @param {*} param
* @param {Number} link_id [optional] in case you want to trigger and specific output link in a slot
*/
LGraphNode.prototype.triggerSlot = function( slot, param, link_id )
{
	if( !this.outputs )
		return;

	var output = this.outputs[ slot ];
	if( !output )
		return;

	var links = output.links;
	if(!links || !links.length)
		return;

	if(this.graph)
		this.graph._last_trigger_time = LiteGraph.getTime();

	//for every link attached here
	for(var k = 0; k < links.length; ++k)
	{
		var id = links[k];
		if( link_id != null && link_id != id ) //to skip links
			continue;
		var link_info = this.graph.links[ links[k] ];
		if(!link_info) //not connected
			continue;
		link_info._last_time = LiteGraph.getTime();
		var node = this.graph.getNodeById( link_info.target_id );
		if(!node) //node not found?
			continue;

		//used to mark events in graph
		var target_connection = node.inputs[ link_info.target_slot ];

		if(node.onAction)
			node.onAction( target_connection.name, param );
		else if(node.mode === LiteGraph.ON_TRIGGER)
		{
			if(node.onExecute)
				node.onExecute(param);
		}
	}
}

/**
* clears the trigger slot animation
* @method clearTriggeredSlot
* @param {Number} slot the index of the output slot
* @param {Number} link_id [optional] in case you want to trigger and specific output link in a slot
*/
LGraphNode.prototype.clearTriggeredSlot = function( slot, link_id )
{
	if( !this.outputs )
		return;

	var output = this.outputs[ slot ];
	if( !output )
		return;

	var links = output.links;
	if(!links || !links.length)
		return;

	//for every link attached here
	for(var k = 0; k < links.length; ++k)
	{
		var id = links[k];
		if( link_id != null && link_id != id ) //to skip links
			continue;
		var link_info = this.graph.links[ links[k] ];
		if(!link_info) //not connected
			continue;
		link_info._last_time = 0;
	}
}

/**
* add a new property to this node
* @method addProperty
* @param {string} name
* @param {*} default_value
* @param {string} type string defining the output type ("vec3","number",...)
* @param {Object} extra_info this can be used to have special properties of the property (like values, etc)
*/
LGraphNode.prototype.addProperty = function( name, default_value, type, extra_info )
{
	var o = { name: name, type: type, default_value: default_value };
	if(extra_info)
		for(var i in extra_info)
			o[i] = extra_info[i];
	if(!this.properties_info)
		this.properties_info = [];
	this.properties_info.push(o);
	if(!this.properties)
		this.properties = {};
	this.properties[ name ] = default_value;
	return o;
}


//connections

/**
* add a new output slot to use in this node
* @method addOutput
* @param {string} name
* @param {string} type string defining the output type ("vec3","number",...)
* @param {Object} extra_info this can be used to have special properties of an output (label, special color, position, etc)
*/
LGraphNode.prototype.addOutput = function(name,type,extra_info)
{
	var o = { name: name, type: type, links: null };
	if(extra_info)
		for(var i in extra_info)
			o[i] = extra_info[i];

	if(!this.outputs)
		this.outputs = [];
	this.outputs.push(o);
	if(this.onOutputAdded)
		this.onOutputAdded(o);
	this.size = this.computeSize();
	this.setDirtyCanvas(true,true);
	return o;
}

/**
* add a new output slot to use in this node
* @method addOutputs
* @param {Array} array of triplets like [[name,type,extra_info],[...]]
*/
LGraphNode.prototype.addOutputs = function(array)
{
	for(var i = 0; i < array.length; ++i)
	{
		var info = array[i];
		var o = {name:info[0],type:info[1],link:null};
		if(array[2])
			for(var j in info[2])
				o[j] = info[2][j];

		if(!this.outputs)
			this.outputs = [];
		this.outputs.push(o);
		if(this.onOutputAdded)
			this.onOutputAdded(o);
	}

	this.size = this.computeSize();
	this.setDirtyCanvas(true,true);
}

/**
* remove an existing output slot
* @method removeOutput
* @param {number} slot
*/
LGraphNode.prototype.removeOutput = function(slot)
{
	this.disconnectOutput(slot);
	this.outputs.splice(slot,1);
	for(var i = slot; i < this.outputs.length; ++i)
	{
		if( !this.outputs[i] || !this.outputs[i].links )
			continue;
		var links = this.outputs[i].links;
		for(var j = 0; j < links.length; ++j)
		{
			var link = this.graph.links[ links[j] ];
			if(!link)
				continue;
			link.origin_slot -= 1;
		}
	}

	this.size = this.computeSize();
	if(this.onOutputRemoved)
		this.onOutputRemoved(slot);
	this.setDirtyCanvas(true,true);
}

/**
* add a new input slot to use in this node
* @method addInput
* @param {string} name
* @param {string} type string defining the input type ("vec3","number",...), it its a generic one use 0
* @param {Object} extra_info this can be used to have special properties of an input (label, color, position, etc)
*/
LGraphNode.prototype.addInput = function(name,type,extra_info)
{
	type = type || 0;
	var o = {name:name,type:type,link:null};
	if(extra_info)
		for(var i in extra_info)
			o[i] = extra_info[i];

	if(!this.inputs)
		this.inputs = [];
	this.inputs.push(o);
	this.size = this.computeSize();
	if(this.onInputAdded)
		this.onInputAdded(o);
	this.setDirtyCanvas(true,true);
	return o;
}

/**
* add several new input slots in this node
* @method addInputs
* @param {Array} array of triplets like [[name,type,extra_info],[...]]
*/
LGraphNode.prototype.addInputs = function(array)
{
	for(var i = 0; i < array.length; ++i)
	{
		var info = array[i];
		var o = {name:info[0], type:info[1], link:null};
		if(array[2])
			for(var j in info[2])
				o[j] = info[2][j];

		if(!this.inputs)
			this.inputs = [];
		this.inputs.push(o);
		if(this.onInputAdded)
			this.onInputAdded(o);
	}

	this.size = this.computeSize();
	this.setDirtyCanvas(true,true);
}

/**
* remove an existing input slot
* @method removeInput
* @param {number} slot
*/
LGraphNode.prototype.removeInput = function(slot)
{
	this.disconnectInput(slot);
	this.inputs.splice(slot,1);
	for(var i = slot; i < this.inputs.length; ++i)
	{
		if(!this.inputs[i])
			continue;
		var link = this.graph.links[ this.inputs[i].link ];
		if(!link)
			continue;
		link.target_slot -= 1;
	}
	this.size = this.computeSize();
	if(this.onInputRemoved)
		this.onInputRemoved(slot);
	this.setDirtyCanvas(true,true);
}

/**
* add an special connection to this node (used for special kinds of graphs)
* @method addConnection
* @param {string} name
* @param {string} type string defining the input type ("vec3","number",...)
* @param {[x,y]} pos position of the connection inside the node
* @param {string} direction if is input or output
*/
LGraphNode.prototype.addConnection = function(name,type,pos,direction)
{
	var o = {
		name: name,
		type: type,
		pos: pos,
		direction: direction,
		links: null
	};
	this.connections.push( o );
	return o;
}

/**
* computes the size of a node according to its inputs and output slots
* @method computeSize
* @param {number} minHeight
* @return {number} the total size
*/
LGraphNode.prototype.computeSize = function( minHeight, out )
{
	var rows = Math.max( this.inputs ? this.inputs.length : 1, this.outputs ? this.outputs.length : 1);
	var size = out || new Float32Array([0,0]);
	rows = Math.max(rows, 1);
	var font_size = LiteGraph.NODE_TEXT_SIZE; //although it should be graphcanvas.inner_text_font size
	size[1] = (this.constructor.slot_start_y || 0) + rows * (font_size + 1) + 4;
	if( this.widgets && this.widgets.length )
		size[1] += this.widgets.length * (LiteGraph.NODE_WIDGET_HEIGHT + 4) + 8;

	var font_size = font_size;
	var title_width = compute_text_size( this.title );
	var input_width = 0;
	var output_width = 0;

	if(this.inputs)
		for(var i = 0, l = this.inputs.length; i < l; ++i)
		{
			var input = this.inputs[i];
			var text = input.label || input.name || "";
			var text_width = compute_text_size( text );
			if(input_width < text_width)
				input_width = text_width;
		}

	if(this.outputs)
		for(var i = 0, l = this.outputs.length; i < l; ++i)
		{
			var output = this.outputs[i];
			var text = output.label || output.name || "";
			var text_width = compute_text_size( text );
			if(output_width < text_width)
				output_width = text_width;
		}

	size[0] = Math.max( input_width + output_width + 10, title_width );
	size[0] = Math.max( size[0], LiteGraph.NODE_WIDTH );
	if(this.widgets && this.widgets.length)
		size[0] = Math.max( size[0], LiteGraph.NODE_WIDTH * 1.5 );

	if(this.onResize)
		this.onResize(size);

	function compute_text_size( text )
	{
		if(!text)
			return 0;
		return font_size * text.length * 0.6;
	}

	return size;
}

/**
* Allows to pass 
* 
* @method addWidget
* @return {Object} the created widget
*/
LGraphNode.prototype.addWidget = function( type, name, value, callback, options )
{
	if(!this.widgets)
		this.widgets = [];
	var w = {
		type: type.toLowerCase(),
		name: name,
		value: value,
		callback: callback,
		options: options || {}
	};

	if(w.options.y !== undefined )
		w.y = w.options.y;

	if( !callback )
		console.warn("LiteGraph addWidget('button',...) without a callback");
	if( type == "combo" && !w.options.values )
		throw("LiteGraph addWidget('combo',...) requires to pass values in options: { values:['red','blue'] }");
	this.widgets.push(w);
	return w;
}

LGraphNode.prototype.addCustomWidget = function( custom_widget )
{
	if(!this.widgets)
		this.widgets = [];
	this.widgets.push(custom_widget);
	return custom_widget;
}


/**
* returns the bounding of the object, used for rendering purposes
* bounding is: [topleft_cornerx, topleft_cornery, width, height]
* @method getBounding
* @return {Float32Array[4]} the total size
*/
LGraphNode.prototype.getBounding = function( out )
{
	out = out || new Float32Array(4);
	out[0] = this.pos[0] - 4;
	out[1] = this.pos[1] - LiteGraph.NODE_TITLE_HEIGHT;
	out[2] = this.size[0] + 4;
	out[3] = this.size[1] + LiteGraph.NODE_TITLE_HEIGHT;

	if( this.onBounding )
		this.onBounding( out );
	return out;
}

/**
* checks if a point is inside the shape of a node
* @method isPointInside
* @param {number} x
* @param {number} y
* @return {boolean}
*/
LGraphNode.prototype.isPointInside = function( x, y, margin, skip_title )
{
	margin = margin || 0;

	var margin_top = this.graph && this.graph.isLive() ? 0 : 20;
	if(skip_title)
		margin_top = 0;
	if(this.flags && this.flags.collapsed)
	{
		//if ( distance([x,y], [this.pos[0] + this.size[0]*0.5, this.pos[1] + this.size[1]*0.5]) < LiteGraph.NODE_COLLAPSED_RADIUS)
		if( isInsideRectangle( x, y, this.pos[0] - margin, this.pos[1] - LiteGraph.NODE_TITLE_HEIGHT - margin, (this._collapsed_width||LiteGraph.NODE_COLLAPSED_WIDTH) + 2 * margin, LiteGraph.NODE_TITLE_HEIGHT + 2 * margin ) )
			return true;
	}
	else if ( (this.pos[0] - 4 - margin) < x && (this.pos[0] + this.size[0] + 4 + margin) > x
		&& (this.pos[1] - margin_top - margin) < y && (this.pos[1] + this.size[1] + margin) > y)
		return true;
	return false;
}

/**
* checks if a point is inside a node slot, and returns info about which slot
* @method getSlotInPosition
* @param {number} x
* @param {number} y
* @return {Object} if found the object contains { input|output: slot object, slot: number, link_pos: [x,y] }
*/
LGraphNode.prototype.getSlotInPosition = function( x, y )
{
	//search for inputs
	var link_pos = new Float32Array(2);
	if(this.inputs)
		for(var i = 0, l = this.inputs.length; i < l; ++i)
		{
			var input = this.inputs[i];
			this.getConnectionPos( true,i, link_pos );
			if( isInsideRectangle(x, y, link_pos[0] - 10, link_pos[1] - 5, 20,10) )
				return { input: input, slot: i, link_pos: link_pos, locked: input.locked };
		}

	if(this.outputs)
		for(var i = 0, l = this.outputs.length; i < l; ++i)
		{
			var output = this.outputs[i];
			this.getConnectionPos(false,i,link_pos);
			if( isInsideRectangle(x, y, link_pos[0] - 10, link_pos[1] - 5, 20,10) )
				return { output: output, slot: i, link_pos: link_pos, locked: output.locked };
		}

	return null;
}

/**
* returns the input slot with a given name (used for dynamic slots), -1 if not found
* @method findInputSlot
* @param {string} name the name of the slot
* @return {number} the slot (-1 if not found)
*/
LGraphNode.prototype.findInputSlot = function(name)
{
	if(!this.inputs)
		return -1;
	for(var i = 0, l = this.inputs.length; i < l; ++i)
		if(name == this.inputs[i].name)
			return i;
	return -1;
}

/**
* returns the output slot with a given name (used for dynamic slots), -1 if not found
* @method findOutputSlot
* @param {string} name the name of the slot
* @return {number} the slot (-1 if not found)
*/
LGraphNode.prototype.findOutputSlot = function(name)
{
	if(!this.outputs) return -1;
	for(var i = 0, l = this.outputs.length; i < l; ++i)
		if(name == this.outputs[i].name)
			return i;
	return -1;
}

/**
* connect this node output to the input of another node
* @method connect
* @param {number_or_string} slot (could be the number of the slot or the string with the name of the slot)
* @param {LGraphNode} node the target node
* @param {number_or_string} target_slot the input slot of the target node (could be the number of the slot or the string with the name of the slot, or -1 to connect a trigger)
* @return {Object} the link_info is created, otherwise null
*/
LGraphNode.prototype.connect = function( slot, target_node, target_slot )
{
	target_slot = target_slot || 0;

	if(!this.graph) //could be connected before adding it to a graph
	{
		console.log("Connect: Error, node doesnt belong to any graph. Nodes must be added first to a graph before connecting them."); //due to link ids being associated with graphs
		return null;
	}


	//seek for the output slot
	if( slot.constructor === String )
	{
		slot = this.findOutputSlot(slot);
		if(slot == -1)
		{
			if(LiteGraph.debug)
				console.log("Connect: Error, no slot of name " + slot);
			return null;
		}
	}
	else if(!this.outputs || slot >= this.outputs.length)
	{
		if(LiteGraph.debug)
			console.log("Connect: Error, slot number not found");
		return null;
	}

	if(target_node && target_node.constructor === Number)
		target_node = this.graph.getNodeById( target_node );
	if(!target_node)
		throw("target node is null");

	//avoid loopback
	if(target_node == this)
		return null;

	//you can specify the slot by name
	if(target_slot.constructor === String)
	{
		target_slot = target_node.findInputSlot( target_slot );
		if(target_slot == -1)
		{
			if(LiteGraph.debug)
				console.log("Connect: Error, no slot of name " + target_slot);
			return null;
		}
	}
	else if( target_slot === LiteGraph.EVENT )
	{
		//search for first slot with event?
		/*
		//create input for trigger
		var input = target_node.addInput("onTrigger", LiteGraph.EVENT );
		target_slot = target_node.inputs.length - 1; //last one is the one created
		target_node.mode = LiteGraph.ON_TRIGGER;
		*/
		return null;
	}
	else if( !target_node.inputs || target_slot >= target_node.inputs.length )
	{
		if(LiteGraph.debug)
			console.log("Connect: Error, slot number not found");
		return null;
	}

	//if there is something already plugged there, disconnect
	if(target_node.inputs[ target_slot ].link != null )
		target_node.disconnectInput( target_slot );

	//why here??
	//this.setDirtyCanvas(false,true);
	//this.graph.connectionChange( this );

	var output = this.outputs[slot];

	//allows nodes to block connection
	if(target_node.onConnectInput)
		if( target_node.onConnectInput( target_slot, output.type, output ) === false)
			return null;

	var input = target_node.inputs[target_slot];
	var link_info = null;

	if( LiteGraph.isValidConnection( output.type, input.type ) )
	{
		link_info = new LLink( this.graph.last_link_id++, input.type, this.id, slot, target_node.id, target_slot );

		//add to graph links list
		this.graph.links[ link_info.id ] = link_info;

		//connect in output
		if( output.links == null )
			output.links = [];
		output.links.push( link_info.id );
		//connect in input
		target_node.inputs[target_slot].link = link_info.id;
		if(this.graph)
			this.graph._version++;
		if(this.onConnectionsChange)
			this.onConnectionsChange( LiteGraph.OUTPUT, slot, true, link_info, output ); //link_info has been created now, so its updated
		if(target_node.onConnectionsChange)
			target_node.onConnectionsChange( LiteGraph.INPUT, target_slot, true, link_info, input );
		if( this.graph && this.graph.onNodeConnectionChange )
		{
			this.graph.onNodeConnectionChange( LiteGraph.INPUT, target_node, target_slot, this, slot );
			this.graph.onNodeConnectionChange( LiteGraph.OUTPUT, this, slot, target_node, target_slot );
		}
	}

	this.setDirtyCanvas(false,true);
	this.graph.connectionChange( this, link_info );

	return link_info;
}

/**
* disconnect one output to an specific node
* @method disconnectOutput
* @param {number_or_string} slot (could be the number of the slot or the string with the name of the slot)
* @param {LGraphNode} target_node the target node to which this slot is connected [Optional, if not target_node is specified all nodes will be disconnected]
* @return {boolean} if it was disconnected succesfully
*/
LGraphNode.prototype.disconnectOutput = function( slot, target_node )
{
	if( slot.constructor === String )
	{
		slot = this.findOutputSlot(slot);
		if(slot == -1)
		{
			if(LiteGraph.debug)
				console.log("Connect: Error, no slot of name " + slot);
			return false;
		}
	}
	else if(!this.outputs || slot >= this.outputs.length)
	{
		if(LiteGraph.debug)
			console.log("Connect: Error, slot number not found");
		return false;
	}

	//get output slot
	var output = this.outputs[slot];
	if(!output || !output.links || output.links.length == 0)
		return false;

	//one of the output links in this slot
	if(target_node)
	{
		if(target_node.constructor === Number)
			target_node = this.graph.getNodeById( target_node );
		if(!target_node)
			throw("Target Node not found");

		for(var i = 0, l = output.links.length; i < l; i++)
		{
			var link_id = output.links[i];
			var link_info = this.graph.links[ link_id ];

			//is the link we are searching for...
			if( link_info.target_id == target_node.id )
			{
				output.links.splice(i,1); //remove here
				var input = target_node.inputs[ link_info.target_slot ];
				input.link = null; //remove there
				delete this.graph.links[ link_id ]; //remove the link from the links pool
				if(this.graph)
					this.graph._version++;
				if(target_node.onConnectionsChange)
					target_node.onConnectionsChange( LiteGraph.INPUT, link_info.target_slot, false, link_info, input ); //link_info hasnt been modified so its ok
				if(this.onConnectionsChange)
					this.onConnectionsChange( LiteGraph.OUTPUT, slot, false, link_info, output );
				if( this.graph && this.graph.onNodeConnectionChange )
					this.graph.onNodeConnectionChange( LiteGraph.OUTPUT, this, slot );
				if( this.graph && this.graph.onNodeConnectionChange )
				{
					this.graph.onNodeConnectionChange( LiteGraph.OUTPUT, this, slot );
					this.graph.onNodeConnectionChange( LiteGraph.INPUT, target_node, link_info.target_slot );
				}
				break;
			}
		}
	}
	else //all the links in this output slot
	{
		for(var i = 0, l = output.links.length; i < l; i++)
		{
			var link_id = output.links[i];
			var link_info = this.graph.links[ link_id ];
			if(!link_info) //bug: it happens sometimes
				continue;

			var target_node = this.graph.getNodeById( link_info.target_id );
			var input = null;
			if(this.graph)
				this.graph._version++;
			if(target_node)
			{
				input = target_node.inputs[ link_info.target_slot ];
				input.link = null; //remove other side link
				if(target_node.onConnectionsChange)
					target_node.onConnectionsChange( LiteGraph.INPUT, link_info.target_slot, false, link_info, input ); //link_info hasnt been modified so its ok
				if( this.graph && this.graph.onNodeConnectionChange )
					this.graph.onNodeConnectionChange( LiteGraph.INPUT, target_node, link_info.target_slot );
			}
			delete this.graph.links[ link_id ]; //remove the link from the links pool
			if(this.onConnectionsChange)
				this.onConnectionsChange( LiteGraph.OUTPUT, slot, false, link_info, output );
			if( this.graph && this.graph.onNodeConnectionChange )
			{
				this.graph.onNodeConnectionChange( LiteGraph.OUTPUT, this, slot );
				this.graph.onNodeConnectionChange( LiteGraph.INPUT, target_node, link_info.target_slot );
			}
		}
		output.links = null;
	}


	this.setDirtyCanvas(false,true);
	this.graph.connectionChange( this );
	return true;
}

/**
* disconnect one input
* @method disconnectInput
* @param {number_or_string} slot (could be the number of the slot or the string with the name of the slot)
* @return {boolean} if it was disconnected succesfully
*/
LGraphNode.prototype.disconnectInput = function( slot )
{
	//seek for the output slot
	if( slot.constructor === String )
	{
		slot = this.findInputSlot(slot);
		if(slot == -1)
		{
			if(LiteGraph.debug)
				console.log("Connect: Error, no slot of name " + slot);
			return false;
		}
	}
	else if(!this.inputs || slot >= this.inputs.length)
	{
		if(LiteGraph.debug)
			console.log("Connect: Error, slot number not found");
		return false;
	}

	var input = this.inputs[slot];
	if(!input)
		return false;

	var link_id = this.inputs[slot].link;
	this.inputs[slot].link = null;

	//remove other side
	var link_info = this.graph.links[ link_id ];
	if( link_info )
	{
		var target_node = this.graph.getNodeById( link_info.origin_id );
		if(!target_node)
			return false;

		var output = target_node.outputs[ link_info.origin_slot ];
		if(!output || !output.links || output.links.length == 0)
			return false;

		//search in the inputs list for this link
		for(var i = 0, l = output.links.length; i < l; i++)
		{
			if( output.links[i] == link_id )
			{
				output.links.splice(i,1);
				break;
			}
		}

		delete this.graph.links[ link_id ]; //remove from the pool
		if(this.graph)
			this.graph._version++;
		if( this.onConnectionsChange )
			this.onConnectionsChange( LiteGraph.INPUT, slot, false, link_info, input );
		if( target_node.onConnectionsChange )
			target_node.onConnectionsChange( LiteGraph.OUTPUT, i, false, link_info, output );
		if( this.graph && this.graph.onNodeConnectionChange )
		{
			this.graph.onNodeConnectionChange( LiteGraph.OUTPUT, target_node, i );
			this.graph.onNodeConnectionChange( LiteGraph.INPUT, this, slot );
		}
	}

	this.setDirtyCanvas(false,true);
	this.graph.connectionChange( this );
	return true;
}

/**
* returns the center of a connection point in canvas coords
* @method getConnectionPos
* @param {boolean} is_input true if if a input slot, false if it is an output
* @param {number_or_string} slot (could be the number of the slot or the string with the name of the slot)
* @param {vec2} out [optional] a place to store the output, to free garbage
* @return {[x,y]} the position
**/
LGraphNode.prototype.getConnectionPos = function( is_input, slot_number, out )
{
	out = out || new Float32Array(2);
	var num_slots = 0;
	if( is_input && this.inputs )
		num_slots = this.inputs.length;
	if( !is_input && this.outputs )
		num_slots = this.outputs.length;

	if(this.flags.collapsed)
	{
		var w = (this._collapsed_width || LiteGraph.NODE_COLLAPSED_WIDTH);
		if( this.horizontal )
		{
			out[0] = this.pos[0] + w * 0.5; 
			if(is_input)
				out[1] = this.pos[1] - LiteGraph.NODE_TITLE_HEIGHT;
			else
				out[1] = this.pos[1];
		}
		else
		{
			if(is_input)
				out[0] = this.pos[0];
			else
				out[0] = this.pos[0] + w;
			out[1] = this.pos[1] - LiteGraph.NODE_TITLE_HEIGHT * 0.5;
		}
		return out;
	}

	if(is_input && slot_number == -1)
	{
		out[0] = this.pos[0] + 10;
		out[1] = this.pos[1] + 10;
		return out;
	}

	//hardcoded pos
	if(is_input && num_slots > slot_number && this.inputs[ slot_number ].pos)
	{
		out[0] = this.pos[0] + this.inputs[slot_number].pos[0];
		out[1] = this.pos[1] + this.inputs[slot_number].pos[1];
		return out;
	}
	else if(!is_input && num_slots > slot_number && this.outputs[ slot_number ].pos)
	{
		out[0] = this.pos[0] + this.outputs[slot_number].pos[0];
		out[1] = this.pos[1] + this.outputs[slot_number].pos[1];
		return out;
	}

	//horizontal distributed slots
	if(this.horizontal)
	{
		out[0] = this.pos[0] + (slot_number + 0.5) * (this.size[0] / num_slots);
		if(is_input)
			out[1] = this.pos[1] - LiteGraph.NODE_TITLE_HEIGHT;
		else
			out[1] = this.pos[1] + this.size[1];
		return out;
	}
	
	//default
	if(is_input)
		out[0] = this.pos[0];
	else
		out[0] = this.pos[0] + this.size[0] + 1;
	out[1] = this.pos[1] + 10 + slot_number * LiteGraph.NODE_SLOT_HEIGHT + (this.constructor.slot_start_y || 0);
	return out;
}

/* Force align to grid */
LGraphNode.prototype.alignToGrid = function()
{
	this.pos[0] = LiteGraph.CANVAS_GRID_SIZE * Math.round(this.pos[0] / LiteGraph.CANVAS_GRID_SIZE);
	this.pos[1] = LiteGraph.CANVAS_GRID_SIZE * Math.round(this.pos[1] / LiteGraph.CANVAS_GRID_SIZE);
}


/* Console output */
LGraphNode.prototype.trace = function(msg)
{
	if(!this.console)
		this.console = [];
	this.console.push(msg);
	if(this.console.length > LGraphNode.MAX_CONSOLE)
		this.console.shift();

	this.graph.onNodeTrace(this,msg);
}

/* Forces to redraw or the main canvas (LGraphNode) or the bg canvas (links) */
LGraphNode.prototype.setDirtyCanvas = function(dirty_foreground, dirty_background)
{
	if(!this.graph)
		return;
	this.graph.sendActionToCanvas("setDirty",[dirty_foreground, dirty_background]);
}

LGraphNode.prototype.loadImage = function(url)
{
	var img = new Image();
	img.src = LiteGraph.node_images_path + url;
	img.ready = false;

	var that = this;
	img.onload = function() {
		this.ready = true;
		that.setDirtyCanvas(true);
	}
	return img;
}

//safe LGraphNode action execution (not sure if safe)
/*
LGraphNode.prototype.executeAction = function(action)
{
	if(action == "") return false;

	if( action.indexOf(";") != -1 || action.indexOf("}") != -1)
	{
		this.trace("Error: Action contains unsafe characters");
		return false;
	}

	var tokens = action.split("(");
	var func_name = tokens[0];
	if( typeof(this[func_name]) != "function")
	{
		this.trace("Error: Action not found on node: " + func_name);
		return false;
	}

	var code = action;

	try
	{
		var _foo = eval;
		eval = null;
		(new Function("with(this) { " + code + "}")).call(this);
		eval = _foo;
	}
	catch (err)
	{
		this.trace("Error executing action {" + action + "} :" + err);
		return false;
	}

	return true;
}
*/

/* Allows to get onMouseMove and onMouseUp events even if the mouse is out of focus */
LGraphNode.prototype.captureInput = function(v)
{
	if(!this.graph || !this.graph.list_of_graphcanvas)
		return;

	var list = this.graph.list_of_graphcanvas;

	for(var i = 0; i < list.length; ++i)
	{
		var c = list[i];
		//releasing somebody elses capture?!
		if(!v && c.node_capturing_input != this)
			continue;

		//change
		c.node_capturing_input = v ? this : null;
	}
}

/**
* Collapse the node to make it smaller on the canvas
* @method collapse
**/
LGraphNode.prototype.collapse = function( force )
{
	this.graph._version++;
	if(this.constructor.collapsable === false && !force)
		return;
	if(!this.flags.collapsed)
		this.flags.collapsed = true;
	else
		this.flags.collapsed = false;
	this.setDirtyCanvas(true,true);
}

/**
* Forces the node to do not move or realign on Z
* @method pin
**/

LGraphNode.prototype.pin = function(v)
{
	this.graph._version++;
	if(v === undefined)
		this.flags.pinned = !this.flags.pinned;
	else
		this.flags.pinned = v;
}

LGraphNode.prototype.localToScreen = function(x,y, graphcanvas)
{
	return [(x + this.pos[0]) * graphcanvas.scale + graphcanvas.offset[0],
		(y + this.pos[1]) * graphcanvas.scale + graphcanvas.offset[1]];
}




function LGraphGroup( title )
{
	this._ctor( title );
}

global.LGraphGroup = LiteGraph.LGraphGroup = LGraphGroup;

LGraphGroup.prototype._ctor = function( title )
{
	this.title = title || "Group";
	this.font_size = 24;
	this.color = LGraphCanvas.node_colors.pale_blue ? LGraphCanvas.node_colors.pale_blue.groupcolor : "#AAA";
	this._bounding = new Float32Array([10,10,140,80]);
	this._pos = this._bounding.subarray(0,2);
	this._size = this._bounding.subarray(2,4);
	this._nodes = [];
	this.graph = null;

	Object.defineProperty( this, "pos", {
		set: function(v)
		{
			if(!v || v.length < 2)
				return;
			this._pos[0] = v[0];
			this._pos[1] = v[1];
		},
		get: function()
		{
			return this._pos;
		},
		enumerable: true
	});

	Object.defineProperty( this, "size", {
		set: function(v)
		{
			if(!v || v.length < 2)
				return;
			this._size[0] = Math.max(140,v[0]);
			this._size[1] = Math.max(80,v[1]);
		},
		get: function()
		{
			return this._size;
		},
		enumerable: true
	});
}

LGraphGroup.prototype.configure = function(o)
{
	this.title = o.title;
	this._bounding.set( o.bounding );
	this.color = o.color;
	this.font = o.font;
}

LGraphGroup.prototype.serialize = function()
{
	var b = this._bounding;
	return {
		title: this.title,
		bounding: [ Math.round(b[0]), Math.round(b[1]), Math.round(b[2]), Math.round(b[3]) ],
		color: this.color,
		font: this.font
	};
}

LGraphGroup.prototype.move = function(deltax, deltay, ignore_nodes)
{
	this._pos[0] += deltax;
	this._pos[1] += deltay;
	if(ignore_nodes)
		return;
	for(var i = 0; i < this._nodes.length; ++i)
	{
		var node = this._nodes[i];
		node.pos[0] += deltax;
		node.pos[1] += deltay;
	}
}

LGraphGroup.prototype.recomputeInsideNodes = function()
{
	this._nodes.length = 0;
	var nodes = this.graph._nodes;
	var node_bounding = new Float32Array(4);

	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		node.getBounding( node_bounding );
		if(!overlapBounding( this._bounding, node_bounding ))
			continue; //out of the visible area
		this._nodes.push( node );
	}
}

LGraphGroup.prototype.isPointInside = LGraphNode.prototype.isPointInside;
LGraphGroup.prototype.setDirtyCanvas = LGraphNode.prototype.setDirtyCanvas;

//*********************************************************************************
// LGraphCanvas: LGraph renderer CLASS
//*********************************************************************************

/**
* This class is in charge of rendering one graph inside a canvas. And provides all the interaction required.
* Valid callbacks are: onNodeSelected, onNodeDeselected, onShowNodePanel, onNodeDblClicked
*
* @class LGraphCanvas
* @constructor
* @param {HTMLCanvas} canvas the canvas where you want to render (it accepts a selector in string format or the canvas element itself)
* @param {LGraph} graph [optional]
* @param {Object} options [optional] { skip_rendering, autoresize }
*/
function LGraphCanvas( canvas, graph, options )
{
	options = options || {};

	//if(graph === undefined)
  //	throw ("No graph assigned");
	//this.background_image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAQBJREFUeNrs1rEKwjAUhlETUkj3vP9rdmr1Ysammk2w5wdxuLgcMHyptfawuZX4pJSWZTnfnu/lnIe/jNNxHHGNn//HNbbv+4dr6V+11uF527arU7+u63qfa/bnmh8sWLBgwYJlqRf8MEptXPBXJXa37BSl3ixYsGDBMliwFLyCV/DeLIMFCxYsWLBMwSt4Be/NggXLYMGCBUvBK3iNruC9WbBgwYJlsGApeAWv4L1ZBgsWLFiwYJmCV/AK3psFC5bBggULloJX8BpdwXuzYMGCBctgwVLwCl7Be7MMFixYsGDBsu8FH1FaSmExVfAxBa/gvVmwYMGCZbBg/W4vAQYA5tRF9QYlv/QAAAAASUVORK5CYII='

	if(canvas && canvas.constructor === String )
		canvas = document.querySelector( canvas );

	this.max_zoom = 10;
	this.min_zoom = 0.1;
	this.zoom_modify_alpha = true; //otherwise it generates ugly patterns when scaling down too much

	this.title_text_font = "bold "+LiteGraph.NODE_TEXT_SIZE+"px Arial";
	this.inner_text_font = "normal "+LiteGraph.NODE_SUBTEXT_SIZE+"px Arial";
	this.node_title_color = LiteGraph.NODE_TITLE_COLOR;
	this.default_link_color = LiteGraph.LINK_COLOR;
	this.default_connection_color = {
		input_off: "#AAB",
		input_on: "#7F7",
		output_off: "#AAB",
		output_on: "#7F7"
	};

	this.highquality_render = true;
	this.use_gradients = false; //set to true to render titlebar with gradients
	this.editor_alpha = 1; //used for transition
	this.pause_rendering = false;
	this.render_shadows = true;
	this.clear_background = true;

	this.render_only_selected = true;
	this.live_mode = false;
	this.show_info = false; // BL was true;
	this.allow_dragcanvas = true;
	this.allow_dragnodes = true;
	this.allow_interaction = true; //allow to control widgets, buttons, collapse, etc
	this.allow_searchbox = true;
	this.allow_reconnect_links = false; //allows to change a connection with having to redo it again
	this.drag_mode = false;
	this.dragging_rectangle = null;

	this.filter = null; //allows to filter to only accept some type of nodes in a graph

	this.always_render_background = false;
	this.render_canvas_border = true;
	this.render_connections_shadows = false; //too much cpu
	this.render_connections_border = true;
	this.render_curved_connections = true;
	this.render_connection_arrows = true;
	this.render_execution_order = false;

	this.canvas_mouse = [0,0]; //mouse in canvas graph coordinates, where 0,0 is the top-left corner of the blue rectangle

	//to personalize the search box
	this.onSearchBox = null;
	this.onSearchBoxSelection = null;

	//callbacks
	this.onMouse = null;
	this.onDrawBackground = null; //to render background objects (behind nodes and connections) in the canvas affected by transform
	this.onDrawForeground = null; //to render foreground objects (above nodes and connections) in the canvas affected by transform
	this.onDrawOverlay = null; //to render foreground objects not affected by transform (for GUIs)

	this.connections_width = 3;
	this.round_radius = 8;

	this.current_node = null;
	this.node_widget = null; //used for widgets
	this.last_mouse_position = [0,0];
	this.visible_area = new Float32Array(4);
	this.visible_links = [];

	//link canvas and graph
	if(graph)
		graph.attachCanvas(this);

	this.setCanvas( canvas );
	this.clear();

	if(!options.skip_render)
		this.startRendering();

	this.autoresize = options.autoresize;
}

global.LGraphCanvas = LiteGraph.LGraphCanvas = LGraphCanvas;

LGraphCanvas.link_type_colors = {"-1":"#F85",'number':"#AAA","node":"#DCA"};
LGraphCanvas.gradients = {}; //cache of gradients

/**
* clears all the data inside
*
* @method clear
*/
LGraphCanvas.prototype.clear = function()
{
	this.frame = 0;
	this.last_draw_time = 0;
	this.render_time = 0;
	this.fps = 0;

	this.scale = 1;
	this.offset = [0,0];

	this.dragging_rectangle = null;

	this.selected_nodes = {};
	this.selected_group = null;

	this.visible_nodes = [];
	this.node_dragged = null;
	this.node_over = null;
	this.node_capturing_input = null;
	this.connecting_node = null;
	this.highlighted_links = {};

	this.dirty_canvas = true;
	this.dirty_bgcanvas = true;
	this.dirty_area = null;

	this.node_in_panel = null;
	this.node_widget = null;

	this.last_mouse = [0,0];
	this.last_mouseclick = 0;
	this.visible_area.set([0,0,0,0]);

	if(this.onClear)
		this.onClear();
	//this.UIinit();
}

/**
* assigns a graph, you can reasign graphs to the same canvas
*
* @method setGraph
* @param {LGraph} graph
*/
LGraphCanvas.prototype.setGraph = function( graph, skip_clear )
{
	if(this.graph == graph)
		return;

	if(!skip_clear)
		this.clear();

	if(!graph && this.graph)
	{
		this.graph.detachCanvas(this);
		return;
	}

	/*
	if(this.graph)
		this.graph.canvas = null; //remove old graph link to the canvas
	this.graph = graph;
	if(this.graph)
		this.graph.canvas = this;
	*/
	graph.attachCanvas(this);
	this.setDirty(true,true);
}

/**
* opens a graph contained inside a node in the current graph
*
* @method openSubgraph
* @param {LGraph} graph
*/
LGraphCanvas.prototype.openSubgraph = function(graph)
{
	if(!graph)
		throw("graph cannot be null");

	if(this.graph == graph)
		throw("graph cannot be the same");

	this.clear();

	if(this.graph)
	{
		if(!this._graph_stack)
			this._graph_stack = [];
		this._graph_stack.push(this.graph);
	}

	graph.attachCanvas(this);
	this.setDirty(true,true);
}

/**
* closes a subgraph contained inside a node
*
* @method closeSubgraph
* @param {LGraph} assigns a graph
*/
LGraphCanvas.prototype.closeSubgraph = function()
{
	if(!this._graph_stack || this._graph_stack.length == 0)
		return;
	var subraph_node = this.graph._subgraph_node;
	var graph = this._graph_stack.pop();
	this.selected_nodes = {};
	this.highlighted_links = {};
	graph.attachCanvas(this);
	this.setDirty(true,true);
	if( subraph_node )
	{
		this.centerOnNode( subraph_node );
		this.selectNodes( [subraph_node] );
	}
}

/**
* assigns a canvas
*
* @method setCanvas
* @param {Canvas} assigns a canvas (also accepts the ID of the element (not a selector)
*/
LGraphCanvas.prototype.setCanvas = function( canvas, skip_events )
{
	var that = this;

	if(canvas)
	{
		if( canvas.constructor === String )
		{
			canvas = document.getElementById(canvas);
			if(!canvas)
				throw("Error creating LiteGraph canvas: Canvas not found");
		}
	}

	if(canvas === this.canvas)
		return;

	if(!canvas && this.canvas)
	{
		//maybe detach events from old_canvas
		if(!skip_events)
			this.unbindEvents();
	}

	this.canvas = canvas;

	if(!canvas)
		return;

	//this.canvas.tabindex = "1000";
	canvas.className += " lgraphcanvas";
	canvas.data = this;
	canvas.tabindex = '1'; //to allow key events

	//bg canvas: used for non changing stuff
	this.bgcanvas = null;
	if(!this.bgcanvas)
	{
		this.bgcanvas = document.createElement("canvas");
		this.bgcanvas.width = this.canvas.width;
		this.bgcanvas.height = this.canvas.height;
	}

	if(canvas.getContext == null)
	{
		if( canvas.localName != "canvas" )
			throw("Element supplied for LGraphCanvas must be a <canvas> element, you passed a " + canvas.localName );
		throw("This browser doesnt support Canvas");
	}

	var ctx = this.ctx = canvas.getContext("2d");
	if(ctx == null)
	{
		if(!canvas.webgl_enabled)
			console.warn("This canvas seems to be WebGL, enabling WebGL renderer");
		this.enableWebGL();
	}

	//input:  (move and up could be unbinded)
	this._mousemove_callback = this.processMouseMove.bind(this);
	this._mouseup_callback = this.processMouseUp.bind(this);

	if(!skip_events)
		this.bindEvents();
}

//used in some events to capture them
LGraphCanvas.prototype._doNothing = function doNothing(e) { e.preventDefault(); return false; };
LGraphCanvas.prototype._doReturnTrue = function doNothing(e) { e.preventDefault(); return true; };

/**
* binds mouse, keyboard, touch and drag events to the canvas
* @method bindEvents
**/
LGraphCanvas.prototype.bindEvents = function()
{
	if(	this._events_binded )
	{
		console.warn("LGraphCanvas: events already binded");
		return;
	}

	var canvas = this.canvas;
	var ref_window = this.getCanvasWindow();
	var document = ref_window.document; //hack used when moving canvas between windows

	this._mousedown_callback = this.processMouseDown.bind(this);
	this._mousewheel_callback = this.processMouseWheel.bind(this);

	canvas.addEventListener("mousedown", this._mousedown_callback, true ); //down do not need to store the binded
	canvas.addEventListener("mousemove", this._mousemove_callback );
	canvas.addEventListener("mousewheel", this._mousewheel_callback, false);

	canvas.addEventListener("contextmenu", this._doNothing );
	canvas.addEventListener("DOMMouseScroll", this._mousewheel_callback, false);

	//touch events
	//if( 'touchstart' in document.documentElement )
	{
		canvas.addEventListener("touchstart", this.touchHandler, true);
		canvas.addEventListener("touchmove", this.touchHandler, true);
		canvas.addEventListener("touchend", this.touchHandler, true);
		canvas.addEventListener("touchcancel", this.touchHandler, true);
	}

	//Keyboard ******************
	this._key_callback = this.processKey.bind(this);

	canvas.addEventListener("keydown", this._key_callback, true );
	document.addEventListener("keyup", this._key_callback, true ); //in document, otherwise it doesnt fire keyup

	//Droping Stuff over nodes ************************************
	this._ondrop_callback = this.processDrop.bind(this);

	canvas.addEventListener("dragover", this._doNothing, false );
	canvas.addEventListener("dragend", this._doNothing, false );
	canvas.addEventListener("drop", this._ondrop_callback, false );
	canvas.addEventListener("dragenter", this._doReturnTrue, false );

	this._events_binded = true;
}

/**
* unbinds mouse events from the canvas
* @method unbindEvents
**/
LGraphCanvas.prototype.unbindEvents = function()
{
	if(	!this._events_binded )
	{
		console.warn("LGraphCanvas: no events binded");
		return;
	}

	var ref_window = this.getCanvasWindow();
	var document = ref_window.document;

	this.canvas.removeEventListener( "mousedown", this._mousedown_callback );
	this.canvas.removeEventListener( "mousewheel", this._mousewheel_callback );
	this.canvas.removeEventListener( "DOMMouseScroll", this._mousewheel_callback );
	this.canvas.removeEventListener( "keydown", this._key_callback );
	document.removeEventListener( "keyup", this._key_callback );
	this.canvas.removeEventListener( "contextmenu", this._doNothing );
	this.canvas.removeEventListener( "drop", this._ondrop_callback );
	this.canvas.removeEventListener( "dragenter", this._doReturnTrue );

	this.canvas.removeEventListener("touchstart", this.touchHandler );
	this.canvas.removeEventListener("touchmove", this.touchHandler );
	this.canvas.removeEventListener("touchend", this.touchHandler );
	this.canvas.removeEventListener("touchcancel", this.touchHandler );

	this._mousedown_callback = null;
	this._mousewheel_callback = null;
	this._key_callback = null;
	this._ondrop_callback = null;

	this._events_binded = false;
}

LGraphCanvas.getFileExtension = function (url)
{
	var question = url.indexOf("?");
	if(question != -1)
		url = url.substr(0,question);
	var point = url.lastIndexOf(".");
	if(point == -1)
		return "";
	return url.substr(point+1).toLowerCase();
}

/**
* this function allows to render the canvas using WebGL instead of Canvas2D
* this is useful if you plant to render 3D objects inside your nodes, it uses litegl.js for webgl and canvas2DtoWebGL to emulate the Canvas2D calls in webGL
* @method enableWebGL
**/
LGraphCanvas.prototype.enableWebGL = function()
{
	if(typeof(GL) === undefined)
		throw("litegl.js must be included to use a WebGL canvas");
	if(typeof(enableWebGLCanvas) === undefined)
		throw("webglCanvas.js must be included to use this feature");

	this.gl = this.ctx = enableWebGLCanvas(this.canvas);
	this.ctx.webgl = true;
	this.bgcanvas = this.canvas;
	this.bgctx = this.gl;
	this.canvas.webgl_enabled = true;

	/*
	GL.create({ canvas: this.bgcanvas });
	this.bgctx = enableWebGLCanvas( this.bgcanvas );
	window.gl = this.gl;
	*/
}


/**
* marks as dirty the canvas, this way it will be rendered again
*
* @class LGraphCanvas
* @method setDirty
* @param {bool} fgcanvas if the foreground canvas is dirty (the one containing the nodes)
* @param {bool} bgcanvas if the background canvas is dirty (the one containing the wires)
*/
LGraphCanvas.prototype.setDirty = function( fgcanvas, bgcanvas )
{
	if(fgcanvas)
		this.dirty_canvas = true;
	if(bgcanvas)
		this.dirty_bgcanvas = true;
}

/**
* Used to attach the canvas in a popup
*
* @method getCanvasWindow
* @return {window} returns the window where the canvas is attached (the DOM root node)
*/
LGraphCanvas.prototype.getCanvasWindow = function()
{
	if(!this.canvas)
		return window;
	var doc = this.canvas.ownerDocument;
	return doc.defaultView || doc.parentWindow;
}

/**
* starts rendering the content of the canvas when needed
*
* @method startRendering
*/
LGraphCanvas.prototype.startRendering = function()
{
	if(this.is_rendering)
		return; //already rendering

	this.is_rendering = true;
	renderFrame.call(this);

	function renderFrame()
	{
		if(!this.pause_rendering)
			this.draw();

		var window = this.getCanvasWindow();
		if(this.is_rendering)
			window.requestAnimationFrame( renderFrame.bind(this) );
	}
}

/**
* stops rendering the content of the canvas (to save resources)
*
* @method stopRendering
*/
LGraphCanvas.prototype.stopRendering = function()
{
	this.is_rendering = false;
	/*
	if(this.rendering_timer_id)
	{
		clearInterval(this.rendering_timer_id);
		this.rendering_timer_id = null;
	}
	*/
}

/* LiteGraphCanvas input */

LGraphCanvas.prototype.processMouseDown = function(e)
{
	if(!this.graph)
		return;

	this.adjustMouseEvent(e);

	var ref_window = this.getCanvasWindow();
	var document = ref_window.document;
	LGraphCanvas.active_canvas = this;
	var that = this;

	//move mouse move event to the window in case it drags outside of the canvas
	this.canvas.removeEventListener("mousemove", this._mousemove_callback );
	ref_window.document.addEventListener("mousemove", this._mousemove_callback, true ); //catch for the entire window
	ref_window.document.addEventListener("mouseup", this._mouseup_callback, true );

	var node = this.graph.getNodeOnPos( e.canvasX, e.canvasY, this.visible_nodes, 5 );
	var skip_dragging = false;
	var skip_action = false;
	var now = LiteGraph.getTime();
	var is_double_click = (now - this.last_mouseclick) < 300;

	this.canvas_mouse[0] = e.canvasX;
	this.canvas_mouse[1] = e.canvasY;
	this.canvas.focus();

    LiteGraph.closeAllContextMenus( ref_window );

	if(this.onMouse)
	{
		if( this.onMouse(e) == true )
			return;
	}

	if(e.which == 1) //left button mouse
	{
		if( e.ctrlKey )
		{
			this.dragging_rectangle = new Float32Array(4);
			this.dragging_rectangle[0] = e.canvasX;
			this.dragging_rectangle[1] = e.canvasY;
			this.dragging_rectangle[2] = 1;
			this.dragging_rectangle[3] = 1;
			skip_action = true;
		}

		var clicking_canvas_bg = false;

		//when clicked on top of a node
		//and it is not interactive
		if( node && this.allow_interaction && !skip_action )
		{
			if( !this.live_mode && !node.flags.pinned )
				this.bringToFront( node ); //if it wasnt selected?

			//not dragging mouse to connect two slots
			if(!this.connecting_node && !node.flags.collapsed && !this.live_mode)
			{
				//Search for corner for resize
				if( !skip_action && node.resizable !== false && isInsideRectangle( e.canvasX, e.canvasY, node.pos[0] + node.size[0] - 5, node.pos[1] + node.size[1] - 5 ,10,10 ))
				{
					this.resizing_node = node;
					this.canvas.style.cursor = "se-resize";
					skip_action = true;
				}
				else
				{
					//search for outputs
					if(node.outputs)
						for(var i = 0, l = node.outputs.length; i < l; ++i)
						{
							var output = node.outputs[i];
							var link_pos = node.getConnectionPos(false,i);
							if( isInsideRectangle( e.canvasX, e.canvasY, link_pos[0] - 15, link_pos[1] - 10, 30,20) )
							{
								this.connecting_node = node;
								this.connecting_output = output;
								this.connecting_pos = node.getConnectionPos(false,i);
								this.connecting_slot = i;

								if( e.shiftKey )
									node.disconnectOutput(i);

								if (is_double_click) {
									if (node.onOutputDblClick)
										node.onOutputDblClick(i, e);
								} else {
									if (node.onOutputClick)
										node.onOutputClick(i, e);
								}

								skip_action = true;
								break;
							}
						}

					//search for inputs
					if(node.inputs)
						for(var i = 0, l = node.inputs.length; i < l; ++i)
						{
							var input = node.inputs[i];
							var link_pos = node.getConnectionPos( true, i );
							if( isInsideRectangle(e.canvasX, e.canvasY, link_pos[0] - 15, link_pos[1] - 10, 30,20) )
							{
								if (is_double_click) {
									if (node.onInputDblClick)
										node.onInputDblClick(i, e);
								} else {
									if (node.onInputClick)
										node.onInputClick(i, e);
								}

								if(input.link !== null)
								{
									var link_info = this.graph.links[ input.link ]; //before disconnecting
									node.disconnectInput(i);

									if( this.allow_reconnect_links || e.shiftKey )
									{
										this.connecting_node = this.graph._nodes_by_id[ link_info.origin_id ];
										this.connecting_slot = link_info.origin_slot;
										this.connecting_output = this.connecting_node.outputs[ this.connecting_slot ];
										this.connecting_pos = this.connecting_node.getConnectionPos( false, this.connecting_slot );
									}

									this.dirty_bgcanvas = true;
									skip_action = true;
								}
							}
						}
				} //not resizing
			}

			//Search for corner for collapsing
			if( !skip_action && isInsideRectangle( e.canvasX, e.canvasY, node.pos[0], node.pos[1] - LiteGraph.NODE_TITLE_HEIGHT, LiteGraph.NODE_TITLE_HEIGHT, LiteGraph.NODE_TITLE_HEIGHT ))
			{
				node.collapse();
				skip_action = true;
			}

			//it wasnt clicked on the links boxes
			if(!skip_action)
			{
				var block_drag_node = false;

				//widgets
				var widget = this.processNodeWidgets( node, this.canvas_mouse, e );
				if(widget)
				{
					block_drag_node = true;
					this.node_widget = [node, widget];
				}

				//double clicking
				if (is_double_click && this.selected_nodes[ node.id ])
				{
					//double click node
					if( node.onDblClick)
						node.onDblClick(e,[e.canvasX - node.pos[0], e.canvasY - node.pos[1]], this);
					this.processNodeDblClicked( node );
					block_drag_node = true;
				}

				//if do not capture mouse
				if( node.onMouseDown && node.onMouseDown( e, [e.canvasX - node.pos[0], e.canvasY - node.pos[1]], this ) )
				{
					block_drag_node = true;
				}
				else if(this.live_mode)
				{
					clicking_canvas_bg = true;
					block_drag_node = true;
				}

				if(!block_drag_node)
				{
					if(this.allow_dragnodes)
						this.node_dragged = node;
					if(!this.selected_nodes[ node.id ])
						this.processNodeSelected( node, e );
				}

				this.dirty_canvas = true;
			}
		}
		else //clicked outside of nodes
		{

			//search for link connector
			for(var i = 0; i < this.visible_links.length; ++i)
			{
				var link = this.visible_links[i];
				var center = link._pos;
				if( !center || e.canvasX < center[0] - 4 || e.canvasX > center[0] + 4 || e.canvasY < center[1] - 4 || e.canvasY > center[1] + 4 )
					continue;
				//link clicked
				this.showLinkMenu( link, e );
				break;
			}

			this.selected_group = this.graph.getGroupOnPos( e.canvasX, e.canvasY );
			this.selected_group_resizing = false;
			if( this.selected_group )
			{
				if( e.ctrlKey )
					this.dragging_rectangle = null;

				var dist = distance( [e.canvasX, e.canvasY], [ this.selected_group.pos[0] + this.selected_group.size[0], this.selected_group.pos[1] + this.selected_group.size[1] ] );
				if( (dist * this.scale) < 10 )
					this.selected_group_resizing = true;
				else
					this.selected_group.recomputeInsideNodes();
			}

			if( is_double_click )
				this.showSearchBox( e );
			
			clicking_canvas_bg = true;
		}

		if( !skip_action && clicking_canvas_bg && this.allow_dragcanvas )
		{
			this.dragging_canvas = true;
		}
	}
	else if (e.which == 2) //middle button
	{

	}
	else if (e.which == 3) //right button
	{
		this.processContextMenu( node, e );
	}

	//TODO
	//if(this.node_selected != prev_selected)
	//	this.onNodeSelectionChange(this.node_selected);

	this.last_mouse[0] = e.localX;
	this.last_mouse[1] = e.localY;
	this.last_mouseclick = LiteGraph.getTime();
	this.last_mouse_dragging = true;

	/*
	if( (this.dirty_canvas || this.dirty_bgcanvas) && this.rendering_timer_id == null)
		this.draw();
	*/

	this.graph.change();

	//this is to ensure to defocus(blur) if a text input element is on focus
	if(!ref_window.document.activeElement || (ref_window.document.activeElement.nodeName.toLowerCase() != "input" && ref_window.document.activeElement.nodeName.toLowerCase() != "textarea"))
		e.preventDefault();
	e.stopPropagation();

	if(this.onMouseDown)
		this.onMouseDown(e);

	return false;
}

/**
* Called when a mouse move event has to be processed
* @method processMouseMove
**/
LGraphCanvas.prototype.processMouseMove = function(e)
{
	if(this.autoresize)
		this.resize();

	if(!this.graph)
		return;

	LGraphCanvas.active_canvas = this;
	this.adjustMouseEvent(e);
	var mouse = [e.localX, e.localY];
	var delta = [mouse[0] - this.last_mouse[0], mouse[1] - this.last_mouse[1]];
	this.last_mouse = mouse;
	this.canvas_mouse[0] = e.canvasX;
	this.canvas_mouse[1] = e.canvasY;
	e.dragging = this.last_mouse_dragging;

	if( this.node_widget )
	{
		this.processNodeWidgets( this.node_widget[0], this.canvas_mouse, e, this.node_widget[1] );
		this.dirty_canvas = true;
	}

	if( this.dragging_rectangle )
	{
		this.dragging_rectangle[2] = e.canvasX - this.dragging_rectangle[0];
		this.dragging_rectangle[3] = e.canvasY - this.dragging_rectangle[1];
		this.dirty_canvas = true;
	}
	else if (this.selected_group) //moving/resizing a group
	{
		if( this.selected_group_resizing )
			this.selected_group.size = [ e.canvasX - this.selected_group.pos[0], e.canvasY - this.selected_group.pos[1] ];
		else
		{
			var deltax = delta[0] / this.scale;
			var deltay = delta[1] / this.scale;
			this.selected_group.move( deltax, deltay, e.ctrlKey );
			if( this.selected_group._nodes.length)
				this.dirty_canvas = true;
		}
		this.dirty_bgcanvas = true;
	}
	else if(this.dragging_canvas)
	{
		this.offset[0] += delta[0] / this.scale;
		this.offset[1] += delta[1] / this.scale;
		this.dirty_canvas = true;
		this.dirty_bgcanvas = true;
	}
	else if(this.allow_interaction)
	{
		if(this.connecting_node)
			this.dirty_canvas = true;

		//get node over
		var node = this.graph.getNodeOnPos( e.canvasX, e.canvasY, this.visible_nodes );

		//remove mouseover flag
		for(var i = 0, l = this.graph._nodes.length; i < l; ++i)
		{
			if(this.graph._nodes[i].mouseOver && node != this.graph._nodes[i])
			{
				//mouse leave
				this.graph._nodes[i].mouseOver = false;
				if(this.node_over && this.node_over.onMouseLeave)
					this.node_over.onMouseLeave(e);
				this.node_over = null;
				this.dirty_canvas = true;
			}
		}

		//mouse over a node
		if(node)
		{
			//this.canvas.style.cursor = "move";
			if(!node.mouseOver)
			{
				//mouse enter
				node.mouseOver = true;
				this.node_over = node;
				this.dirty_canvas = true;

				if(node.onMouseEnter) node.onMouseEnter(e);
			}

			//in case the node wants to do something
			if(node.onMouseMove)
				node.onMouseMove(e, [e.canvasX - node.pos[0], e.canvasY - node.pos[1]], this);

			//if dragging a link 
			if(this.connecting_node)
			{
				var pos = this._highlight_input || [0,0]; //to store the output of isOverNodeInput

				//on top of input
				if( this.isOverNodeBox( node, e.canvasX, e.canvasY ) )
				{
					//mouse on top of the corner box, dont know what to do
				}
				else
				{
					//check if I have a slot below de mouse
					var slot = this.isOverNodeInput( node, e.canvasX, e.canvasY, pos );
					if(slot != -1 && node.inputs[slot] )
					{
						var slot_type = node.inputs[slot].type;
						if( LiteGraph.isValidConnection( this.connecting_output.type, slot_type ) )
							this._highlight_input = pos;
					}
					else
						this._highlight_input = null;
				}
			}

			//Search for corner
			if(this.canvas)
			{
				if( isInsideRectangle(e.canvasX, e.canvasY, node.pos[0] + node.size[0] - 5, node.pos[1] + node.size[1] - 5 ,5,5 ))
					this.canvas.style.cursor = "se-resize";
				else
					this.canvas.style.cursor = "";
			}
		}
		else if(this.canvas)
			this.canvas.style.cursor = "";

		if(this.node_capturing_input && this.node_capturing_input != node && this.node_capturing_input.onMouseMove)
		{
			this.node_capturing_input.onMouseMove(e);
		}


		if(this.node_dragged && !this.live_mode)
		{
			for(var i in this.selected_nodes)
			{
				var n = this.selected_nodes[i];
				n.pos[0] += delta[0] / this.scale;
				n.pos[1] += delta[1] / this.scale;
			}

			this.dirty_canvas = true;
			this.dirty_bgcanvas = true;
		}

		if(this.resizing_node && !this.live_mode)
		{
			//convert mouse to node space
			this.resizing_node.size[0] = e.canvasX - this.resizing_node.pos[0];
			this.resizing_node.size[1] = e.canvasY - this.resizing_node.pos[1];

			//constraint size
			var max_slots = Math.max( this.resizing_node.inputs ? this.resizing_node.inputs.length : 0, this.resizing_node.outputs ? this.resizing_node.outputs.length : 0);
			var min_height = max_slots * LiteGraph.NODE_SLOT_HEIGHT + ( this.resizing_node.widgets ? this.resizing_node.widgets.length : 0 ) * (LiteGraph.NODE_WIDGET_HEIGHT + 4 ) + 4;
			if(this.resizing_node.size[1] < min_height )
				this.resizing_node.size[1] = min_height;
			if(this.resizing_node.size[0] < LiteGraph.NODE_MIN_WIDTH)
				this.resizing_node.size[0] = LiteGraph.NODE_MIN_WIDTH;

			this.canvas.style.cursor = "se-resize";
			this.dirty_canvas = true;
			this.dirty_bgcanvas = true;
		}
	}

	e.preventDefault();
	return false;
}

/**
* Called when a mouse up event has to be processed
* @method processMouseUp
**/
LGraphCanvas.prototype.processMouseUp = function(e)
{
	if(!this.graph)
		return;

	var window = this.getCanvasWindow();
	var document = window.document;
	LGraphCanvas.active_canvas = this;

	//restore the mousemove event back to the canvas
	document.removeEventListener("mousemove", this._mousemove_callback, true );
	this.canvas.addEventListener("mousemove", this._mousemove_callback, true);
	document.removeEventListener("mouseup", this._mouseup_callback, true );

	this.adjustMouseEvent(e);
	var now = LiteGraph.getTime();
	e.click_time = (now - this.last_mouseclick);
	this.last_mouse_dragging = false;

	if (e.which == 1) //left button
	{
		this.node_widget = null;

		if( this.selected_group )
		{
			var diffx = this.selected_group.pos[0] - Math.round( this.selected_group.pos[0] );
			var diffy = this.selected_group.pos[1] - Math.round( this.selected_group.pos[1] );
			this.selected_group.move( diffx, diffy, e.ctrlKey );
			this.selected_group.pos[0] = Math.round( this.selected_group.pos[0] );
			this.selected_group.pos[1] = Math.round( this.selected_group.pos[1] );
			if( this.selected_group._nodes.length )
				this.dirty_canvas = true;
			this.selected_group = null;
		}
		this.selected_group_resizing = false;

		if( this.dragging_rectangle )
		{
			if(this.graph)
			{
				var nodes = this.graph._nodes;
				var node_bounding = new Float32Array(4);
				this.deselectAllNodes();
				//compute bounding and flip if left to right
				var w = Math.abs( this.dragging_rectangle[2] );
				var h = Math.abs( this.dragging_rectangle[3] );
				var startx = this.dragging_rectangle[2] < 0 ? this.dragging_rectangle[0] - w : this.dragging_rectangle[0];
				var starty = this.dragging_rectangle[3] < 0 ? this.dragging_rectangle[1] - h : this.dragging_rectangle[1];
				this.dragging_rectangle[0] = startx; this.dragging_rectangle[1] = starty; this.dragging_rectangle[2] = w; this.dragging_rectangle[3] = h;

				//test against all nodes (not visible becasue the rectangle maybe start outside
				var to_select = [];
				for(var i = 0; i < nodes.length; ++i)
				{
					var node = nodes[i];
					node.getBounding( node_bounding );
					if(!overlapBounding( this.dragging_rectangle, node_bounding ))
						continue; //out of the visible area
					to_select.push(node);
				}
				if(to_select.length)
					this.selectNodes(to_select);
			}
			this.dragging_rectangle = null;
		}
		else if(this.connecting_node) //dragging a connection
		{
			this.dirty_canvas = true;
			this.dirty_bgcanvas = true;

			var node = this.graph.getNodeOnPos( e.canvasX, e.canvasY, this.visible_nodes );

			//node below mouse
			if(node)
			{
				if( this.connecting_output.type == LiteGraph.EVENT && this.isOverNodeBox( node, e.canvasX, e.canvasY ) )
				{
					this.connecting_node.connect( this.connecting_slot, node, LiteGraph.EVENT );
				}
				else
				{
					//slot below mouse? connect
					var slot = this.isOverNodeInput(node, e.canvasX, e.canvasY);
					if(slot != -1)
					{
						this.connecting_node.connect(this.connecting_slot, node, slot);
					}
					else
					{ //not on top of an input
						var input = node.getInputInfo(0);
						//auto connect
						if(this.connecting_output.type == LiteGraph.EVENT)
							this.connecting_node.connect( this.connecting_slot, node, LiteGraph.EVENT );
						else
							if(input && !input.link && LiteGraph.isValidConnection( input.type && this.connecting_output.type ) )
								this.connecting_node.connect( this.connecting_slot, node, 0 );
					}
				}
			}

			this.connecting_output = null;
			this.connecting_pos = null;
			this.connecting_node = null;
			this.connecting_slot = -1;

		}//not dragging connection
		else if(this.resizing_node)
		{
			this.dirty_canvas = true;
			this.dirty_bgcanvas = true;
			this.resizing_node = null;
		}
		else if(this.node_dragged) //node being dragged?
		{
			this.dirty_canvas = true;
			this.dirty_bgcanvas = true;
			this.node_dragged.pos[0] = Math.round(this.node_dragged.pos[0]);
			this.node_dragged.pos[1] = Math.round(this.node_dragged.pos[1]);
			if(this.graph.config.align_to_grid)
				this.node_dragged.alignToGrid();
			this.node_dragged = null;
		}
		else //no node being dragged
		{
			//get node over
			var node = this.graph.getNodeOnPos( e.canvasX, e.canvasY, this.visible_nodes );
			if ( !node && e.click_time < 300 )
				this.deselectAllNodes();

			this.dirty_canvas = true;
			this.dragging_canvas = false;

			if( this.node_over && this.node_over.onMouseUp )
				this.node_over.onMouseUp(e, [e.canvasX - this.node_over.pos[0], e.canvasY - this.node_over.pos[1]], this );
			if( this.node_capturing_input && this.node_capturing_input.onMouseUp )
				this.node_capturing_input.onMouseUp(e, [e.canvasX - this.node_capturing_input.pos[0], e.canvasY - this.node_capturing_input.pos[1]] );
		}
	}
	else if (e.which == 2) //middle button
	{
		//trace("middle");
		this.dirty_canvas = true;
		this.dragging_canvas = false;
	}
	else if (e.which == 3) //right button
	{
		//trace("right");
		this.dirty_canvas = true;
		this.dragging_canvas = false;
	}

	/*
	if((this.dirty_canvas || this.dirty_bgcanvas) && this.rendering_timer_id == null)
		this.draw();
	*/

	this.graph.change();

	e.stopPropagation();
	e.preventDefault();
	return false;
}

/**
* Called when a mouse wheel event has to be processed
* @method processMouseWheel
**/
LGraphCanvas.prototype.processMouseWheel = function(e)
{
	if(!this.graph || !this.allow_dragcanvas)
		return;

	var delta = (e.wheelDeltaY != null ? e.wheelDeltaY : e.detail * -60);

	this.adjustMouseEvent(e);

	var zoom = this.scale;

	if (delta > 0)
		zoom *= 1.1;
	else if (delta < 0)
		zoom *= 1/(1.1);

	this.setZoom( zoom, [ e.localX, e.localY ] );

	/*
	if(this.rendering_timer_id == null)
		this.draw();
	*/

	this.graph.change();

	e.preventDefault();
	return false; // prevent default
}

/**
* retuns true if a position (in graph space) is on top of a node little corner box
* @method isOverNodeBox
**/
LGraphCanvas.prototype.isOverNodeBox = function( node, canvasx, canvasy )
{
	var title_height = LiteGraph.NODE_TITLE_HEIGHT;
	if( isInsideRectangle( canvasx, canvasy, node.pos[0] + 2, node.pos[1] + 2 - title_height, title_height - 4,title_height - 4) )
		return true;
	return false;
}

/**
* retuns true if a position (in graph space) is on top of a node input slot
* @method isOverNodeInput
**/
LGraphCanvas.prototype.isOverNodeInput = function(node, canvasx, canvasy, slot_pos )
{
	if(node.inputs)
		for(var i = 0, l = node.inputs.length; i < l; ++i)
		{
			var input = node.inputs[i];
			var link_pos = node.getConnectionPos( true, i );
			var is_inside = false;
			if( node.horizontal )
				is_inside = isInsideRectangle(canvasx, canvasy, link_pos[0] - 5, link_pos[1] - 10, 10,20)
			else
				is_inside = isInsideRectangle(canvasx, canvasy, link_pos[0] - 10, link_pos[1] - 5, 40,10)
			if(is_inside)
			{
				if(slot_pos)
				{
					slot_pos[0] = link_pos[0];
					slot_pos[1] = link_pos[1];
				}
				return i;
			}
		}
	return -1;
}

/**
* process a key event
* @method processKey
**/
LGraphCanvas.prototype.processKey = function(e)
{
	if(!this.graph)
		return;

	var block_default = false;
	//console.log(e); //debug

	if(e.target.localName == "input")
		return;

	if(e.type == "keydown")
	{
		if(e.keyCode == 32 && e.ctrlKey) //ctrl space, not esc
		{
			this.dragging_canvas = true;
			block_default = true;
		}

		//select all Control A
		if(e.keyCode == 65 && e.ctrlKey)
		{
			this.selectNodes();
			block_default = true;
		}

		if(e.code == "KeyC" && (e.metaKey || e.ctrlKey) && !e.shiftKey ) //copy
		{
			if(this.selected_nodes)
			{
				this.copyToClipboard();
				block_default = true;
			}
		}

		if(e.code == "KeyV" && (e.metaKey || e.ctrlKey) && !e.shiftKey ) //paste
		{
			this.pasteFromClipboard();
		}

		//delete or backspace
		if(e.keyCode == 46 || e.keyCode == 8)
		{
			if(e.target.localName != "input" && e.target.localName != "textarea")
			{
				this.deleteSelectedNodes();
				block_default = true;
			}
		}

		//collapse
		//...

		//TODO
		if(this.selected_nodes)
			for (var i in this.selected_nodes)
				if(this.selected_nodes[i].onKeyDown)
					this.selected_nodes[i].onKeyDown(e);
	}
	else if( e.type == "keyup" )
	{
		if(e.keyCode == 32 && e.ctrlKey)
			this.dragging_canvas = false;

		if(this.selected_nodes)
			for (var i in this.selected_nodes)
				if(this.selected_nodes[i].onKeyUp)
					this.selected_nodes[i].onKeyUp(e);
	}

	this.graph.change();

	if(block_default)
	{
		e.preventDefault();
		return false;
	}
}

LGraphCanvas.prototype.copyToClipboard = function()
{
	var clipboard_info = {
		nodes: [],
		links: []
	};
	var index = 0;
	var selected_nodes_array = [];
	for(var i in this.selected_nodes)
	{
		var node = this.selected_nodes[i];
		node._relative_id = index;
		selected_nodes_array.push( node );
		index += 1;
	}

	for(var i = 0; i < selected_nodes_array.length; ++i)
	{
		var node = selected_nodes_array[i];
		clipboard_info.nodes.push( node.clone().serialize() );
		if(node.inputs && node.inputs.length)
			for(var j = 0; j < node.inputs.length; ++j)
			{
				var input = node.inputs[j];
				if(!input || input.link == null)
					continue;
				var link_info = this.graph.links[ input.link ];
				if(!link_info)
					continue;
				var target_node = this.graph.getNodeById( link_info.origin_id );
				if(!target_node || !this.selected_nodes[ target_node.id ] ) //improve this by allowing connections to non-selected nodes
					continue; //not selected
				clipboard_info.links.push([ target_node._relative_id, j, node._relative_id, link_info.target_slot ]);
			}
	}
	localStorage.setItem( "litegrapheditor_clipboard", JSON.stringify( clipboard_info ) );
}

LGraphCanvas.prototype.pasteFromClipboard = function()
{
	var data = localStorage.getItem( "litegrapheditor_clipboard" );
	if(!data)
		return;

	//create nodes
	var clipboard_info = JSON.parse(data);
	var nodes = [];
	for(var i = 0; i < clipboard_info.nodes.length; ++i)
	{
		var node_data = clipboard_info.nodes[i];
		var node = LiteGraph.createNode( node_data.type );
		if(node)
		{
			node.configure(node_data);
			node.pos[0] += 5;
			node.pos[1] += 5;
			this.graph.add( node );
			nodes.push( node );
		}
	}

	//create links
	for(var i = 0; i < clipboard_info.links.length; ++i)
	{
		var link_info = clipboard_info.links[i];
		var origin_node = nodes[ link_info[0] ];
		var target_node = nodes[ link_info[2] ];
		origin_node.connect( link_info[1], target_node, link_info[3] );
	}

	this.selectNodes( nodes );
}

/**
* process a item drop event on top the canvas
* @method processDrop
**/
LGraphCanvas.prototype.processDrop = function(e)
{
	e.preventDefault();
	this.adjustMouseEvent(e);


	var pos = [e.canvasX,e.canvasY];
	var node = this.graph.getNodeOnPos(pos[0],pos[1]);

	if(!node)
	{
		var r = null;
		if(this.onDropItem)
			r = this.onDropItem( event );
		if(!r)
			this.checkDropItem(e);
		return;
	}

	if( node.onDropFile || node.onDropData )
	{
		var files = e.dataTransfer.files;
		if(files && files.length)
		{
			for(var i=0; i < files.length; i++)
			{
				var file = e.dataTransfer.files[0];
				var filename = file.name;
				var ext = LGraphCanvas.getFileExtension( filename );
				//console.log(file);

				if(node.onDropFile)
					node.onDropFile(file);

				if(node.onDropData)
				{
					//prepare reader
					var reader = new FileReader();
					reader.onload = function (event) {
						//console.log(event.target);
						var data = event.target.result;
						node.onDropData( data, filename, file );
					};

					//read data
					var type = file.type.split("/")[0];
					if(type == "text" || type == "")
						reader.readAsText(file);
					else if (type == "image")
						reader.readAsDataURL(file);
					else
						reader.readAsArrayBuffer(file);
				}
			}
		}
	}

	if(node.onDropItem)
	{
		if( node.onDropItem( event ) )
			return true;
	}

	if(this.onDropItem)
		return this.onDropItem( event );

	return false;
}

//called if the graph doesnt have a default drop item behaviour
LGraphCanvas.prototype.checkDropItem = function(e)
{
	if(e.dataTransfer.files.length)
	{
		var file = e.dataTransfer.files[0];
		var ext = LGraphCanvas.getFileExtension( file.name ).toLowerCase();
		var nodetype = LiteGraph.node_types_by_file_extension[ext];
		if(nodetype)
		{
			var node = LiteGraph.createNode( nodetype.type );
			node.pos = [e.canvasX, e.canvasY];
			this.graph.add( node );
			if( node.onDropFile )
				node.onDropFile( file );
		}
	}
}


LGraphCanvas.prototype.processNodeDblClicked = function(n)
{
	if(this.onShowNodePanel)
		this.onShowNodePanel(n);

	if(this.onNodeDblClicked)
		this.onNodeDblClicked(n);

	this.setDirty(true);
}

LGraphCanvas.prototype.processNodeSelected = function(node,e)
{
	this.selectNode( node, e && e.shiftKey );
	if(this.onNodeSelected)
		this.onNodeSelected(node);
}

LGraphCanvas.prototype.processNodeDeselected = function(node)
{
	this.deselectNode(node);
	if(this.onNodeDeselected)
		this.onNodeDeselected(node);
}

/**
* selects a given node (or adds it to the current selection)
* @method selectNode
**/
LGraphCanvas.prototype.selectNode = function( node, add_to_current_selection )
{
	if(node == null)
		this.deselectAllNodes();
	else
		this.selectNodes([node], add_to_current_selection );
}

/**
* selects several nodes (or adds them to the current selection)
* @method selectNodes
**/
LGraphCanvas.prototype.selectNodes = function( nodes, add_to_current_selection )
{
	if(!add_to_current_selection)
		this.deselectAllNodes();

	nodes = nodes || this.graph._nodes;
	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		if(node.is_selected)
			continue;

		if( !node.is_selected && node.onSelected )
			node.onSelected();
		node.is_selected = true;
		this.selected_nodes[ node.id ] = node;

		if(node.inputs)
			for(var j = 0; j < node.inputs.length; ++j)
				this.highlighted_links[ node.inputs[j].link ] = true;
		if(node.outputs)
			for(var j = 0; j < node.outputs.length; ++j)
			{
				var out = node.outputs[j];
				if( out.links )
					for(var k = 0; k < out.links.length; ++k)
						this.highlighted_links[ out.links[k] ] = true;
			}

	}

	this.setDirty(true);
}

/**
* removes a node from the current selection
* @method deselectNode
**/
LGraphCanvas.prototype.deselectNode = function( node )
{
	if(!node.is_selected)
		return;
	if(node.onDeselected)
		node.onDeselected();
	node.is_selected = false;

	//remove highlighted
	if(node.inputs)
		for(var i = 0; i < node.inputs.length; ++i)
			delete this.highlighted_links[ node.inputs[i].link ];
	if(node.outputs)
		for(var i = 0; i < node.outputs.length; ++i)
		{
			var out = node.outputs[i];
			if( out.links )
				for(var j = 0; j < out.links.length; ++j)
					delete this.highlighted_links[ out.links[j] ];
		}
}

/**
* removes all nodes from the current selection
* @method deselectAllNodes
**/
LGraphCanvas.prototype.deselectAllNodes = function()
{
	if(!this.graph)
		return;
	var nodes = this.graph._nodes;
	for(var i = 0, l = nodes.length; i < l; ++i)
	{
		var node = nodes[i];
		if(!node.is_selected)
			continue;
		if(node.onDeselected)
			node.onDeselected();
		node.is_selected = false;
	}
	this.selected_nodes = {};
	this.highlighted_links = {};
	this.setDirty(true);
}

/**
* deletes all nodes in the current selection from the graph
* @method deleteSelectedNodes
**/
LGraphCanvas.prototype.deleteSelectedNodes = function()
{
	for(var i in this.selected_nodes)
	{
		var m = this.selected_nodes[i];
		//if(m == this.node_in_panel) this.showNodePanel(null);
		this.graph.remove(m);
	}
	this.selected_nodes = {};
	this.highlighted_links = {};
	this.setDirty(true);
}

/**
* centers the camera on a given node
* @method centerOnNode
**/
LGraphCanvas.prototype.centerOnNode = function(node)
{
	this.offset[0] = -node.pos[0] - node.size[0] * 0.5 + (this.canvas.width * 0.5 / this.scale);
	this.offset[1] = -node.pos[1] - node.size[1] * 0.5 + (this.canvas.height * 0.5 / this.scale);
	this.setDirty(true,true);
}

/**
* adds some useful properties to a mouse event, like the position in graph coordinates
* @method adjustMouseEvent
**/
LGraphCanvas.prototype.adjustMouseEvent = function(e)
{
	if(this.canvas)
	{
		var b = this.canvas.getBoundingClientRect();
		e.localX = e.pageX - b.left;
		e.localY = e.pageY - b.top;
	}
	else
	{
		e.localX = e.pageX;
		e.localY = e.pageY;
	}

	e.deltaX = e.localX - this.last_mouse_position[0];
	e.deltaY = e.localY - this.last_mouse_position[1];

	this.last_mouse_position[0] = e.localX;
	this.last_mouse_position[1] = e.localY;

	e.canvasX = e.localX / this.scale - this.offset[0];
	e.canvasY = e.localY / this.scale - this.offset[1];
}

/**
* changes the zoom level of the graph (default is 1), you can pass also a place used to pivot the zoom
* @method setZoom
**/
LGraphCanvas.prototype.setZoom = function(value, zooming_center)
{
	if(!zooming_center && this.canvas)
		zooming_center = [this.canvas.width * 0.5,this.canvas.height * 0.5];

	var center = this.convertOffsetToCanvas( zooming_center );

	this.scale = value;

	if(this.scale > this.max_zoom)
		this.scale = this.max_zoom;
	else if(this.scale < this.min_zoom)
		this.scale = this.min_zoom;

	var new_center = this.convertOffsetToCanvas( zooming_center );
	var delta_offset = [new_center[0] - center[0], new_center[1] - center[1]];

	this.offset[0] += delta_offset[0];
	this.offset[1] += delta_offset[1];

	this.dirty_canvas = true;
	this.dirty_bgcanvas = true;
}

/**
* converts a coordinate in canvas2D space to graphcanvas space (NAME IS CONFUSION, SHOULD BE THE OTHER WAY AROUND)
* @method convertOffsetToCanvas
**/
LGraphCanvas.prototype.convertOffsetToCanvas = function( pos, out )
{
	out = out || [];
	out[0] = pos[0] / this.scale - this.offset[0];
	out[1] = pos[1] / this.scale - this.offset[1];
	return out;
}

/**
* converts a coordinate in graphcanvas space to canvas2D space (NAME IS CONFUSION, SHOULD BE THE OTHER WAY AROUND)
* @method convertCanvasToOffset
**/
LGraphCanvas.prototype.convertCanvasToOffset = function( pos, out )
{
	out = out || [];
	out[0] = (pos[0] + this.offset[0]) * this.scale;
	out[1] = (pos[1] + this.offset[1]) * this.scale;
	return out;
}

LGraphCanvas.prototype.convertEventToCanvas = function(e)
{
	var rect = this.canvas.getBoundingClientRect();
	return this.convertOffsetToCanvas([e.pageX - rect.left,e.pageY - rect.top]);
}

/**
* brings a node to front (above all other nodes)
* @method bringToFront
**/
LGraphCanvas.prototype.bringToFront = function(node)
{
	var i = this.graph._nodes.indexOf(node);
	if(i == -1) return;

	this.graph._nodes.splice(i,1);
	this.graph._nodes.push(node);
}

/**
* sends a node to the back (below all other nodes)
* @method sendToBack
**/
LGraphCanvas.prototype.sendToBack = function(node)
{
	var i = this.graph._nodes.indexOf(node);
	if(i == -1) return;

	this.graph._nodes.splice(i,1);
	this.graph._nodes.unshift(node);
}

/* Interaction */



/* LGraphCanvas render */
var temp = new Float32Array(4);

/**
* checks which nodes are visible (inside the camera area)
* @method computeVisibleNodes
**/
LGraphCanvas.prototype.computeVisibleNodes = function( nodes, out )
{
	var visible_nodes = out || [];
	visible_nodes.length = 0;
	nodes = nodes || this.graph._nodes;
	for(var i = 0, l = nodes.length; i < l; ++i)
	{
		var n = nodes[i];

		//skip rendering nodes in live mode
		if( this.live_mode && !n.onDrawBackground && !n.onDrawForeground )
			continue;

		if(!overlapBounding( this.visible_area, n.getBounding( temp ) ))
			continue; //out of the visible area

		visible_nodes.push(n);
	}
	return visible_nodes;
}

/**
* renders the whole canvas content, by rendering in two separated canvas, one containing the background grid and the connections, and one containing the nodes)
* @method draw
**/
LGraphCanvas.prototype.draw = function(force_canvas, force_bgcanvas)
{
	if(!this.canvas)
		return;

	//fps counting
	var now = LiteGraph.getTime();
	this.render_time = (now - this.last_draw_time)*0.001;
	this.last_draw_time = now;

	if(this.graph)
	{
		var startx = -this.offset[0];
		var starty = -this.offset[1];
		var endx = startx + this.canvas.width / this.scale;
		var endy = starty + this.canvas.height / this.scale;
		this.visible_area[0] = startx;
		this.visible_area[1] = starty;
		this.visible_area[2] = endx - startx;
		this.visible_area[3] = endy - starty;
	}

	if(this.dirty_bgcanvas || force_bgcanvas || this.always_render_background || (this.graph && this.graph._last_trigger_time && (now - this.graph._last_trigger_time) < 1000) )
		this.drawBackCanvas();

	if(this.dirty_canvas || force_canvas)
		this.drawFrontCanvas();

	this.fps = this.render_time ? (1.0 / this.render_time) : 0;
	this.frame += 1;
}

/**
* draws the front canvas (the one containing all the nodes)
* @method drawFrontCanvas
**/
LGraphCanvas.prototype.drawFrontCanvas = function()
{
	this.dirty_canvas = false;

	if(!this.ctx)
		this.ctx = this.bgcanvas.getContext("2d");
	var ctx = this.ctx;
	if(!ctx) //maybe is using webgl...
		return;

	if(ctx.start2D)
		ctx.start2D();

	var canvas = this.canvas;

	//reset in case of error
	ctx.restore();
	ctx.setTransform(1, 0, 0, 1, 0, 0);

	//clip dirty area if there is one, otherwise work in full canvas
	if(this.dirty_area)
	{
		ctx.save();
		ctx.beginPath();
		ctx.rect(this.dirty_area[0],this.dirty_area[1],this.dirty_area[2],this.dirty_area[3]);
		ctx.clip();
	}

	//clear
	//canvas.width = canvas.width;
	if(this.clear_background)
		ctx.clearRect(0,0,canvas.width, canvas.height);

	//draw bg canvas
	if(this.bgcanvas == this.canvas)
		this.drawBackCanvas();
	else
		ctx.drawImage(this.bgcanvas,0,0);

	//rendering
	if(this.onRender)
		this.onRender(canvas, ctx);

	//info widget
	if(this.show_info)
		this.renderInfo(ctx);

	if(this.graph)
	{
		//apply transformations
		ctx.save();
		ctx.scale(this.scale,this.scale);
		ctx.translate( this.offset[0],this.offset[1] );

		//draw nodes
		var drawn_nodes = 0;
		var visible_nodes = this.computeVisibleNodes( null, this.visible_nodes );

		for (var i = 0; i < visible_nodes.length; ++i)
		{
			var node = visible_nodes[i];

			//transform coords system
			ctx.save();
			ctx.translate( node.pos[0], node.pos[1] );

			//Draw
			this.drawNode( node, ctx );
			drawn_nodes += 1;

			//Restore
			ctx.restore();
		}

		//on top (debug)
		if( this.render_execution_order)
			this.drawExecutionOrder(ctx);


		//connections ontop?
		if(this.graph.config.links_ontop)
			if(!this.live_mode)
				this.drawConnections(ctx);

		//current connection (the one being dragged by the mouse)
		if(this.connecting_pos != null)
		{
			ctx.lineWidth = this.connections_width;
			var link_color = null;

			switch( this.connecting_output.type )
			{
				case LiteGraph.EVENT: link_color = LiteGraph.EVENT_LINK_COLOR; break;
				default:
					link_color = LiteGraph.CONNECTING_LINK_COLOR;
			}
			
			//the connection being dragged by the mouse
			this.renderLink( ctx, this.connecting_pos, [ this.canvas_mouse[0], this.canvas_mouse[1] ], null, false, null, link_color, this.connecting_output.dir || (this.connecting_node.horizontal ? LiteGraph.DOWN : LiteGraph.RIGHT), LiteGraph.CENTER );

			ctx.beginPath();
				if( this.connecting_output.type === LiteGraph.EVENT || this.connecting_output.shape === LiteGraph.BOX_SHAPE )
					ctx.rect( (this.connecting_pos[0] - 6) + 0.5, (this.connecting_pos[1] - 5) + 0.5,14,10);
				else
					ctx.arc( this.connecting_pos[0], this.connecting_pos[1],4,0,Math.PI*2);
			ctx.fill();

			ctx.fillStyle = "#ffcc00";
			if(this._highlight_input)
			{
				ctx.beginPath();
					ctx.arc( this._highlight_input[0], this._highlight_input[1],6,0,Math.PI*2);
				ctx.fill();
			}
		}

		if( this.dragging_rectangle )
		{
			ctx.strokeStyle = "#FFF";
			ctx.strokeRect( this.dragging_rectangle[0], this.dragging_rectangle[1], this.dragging_rectangle[2], this.dragging_rectangle[3] );
		}

		if( this.onDrawForeground )
			this.onDrawForeground( ctx, this.visible_rect );

		ctx.restore();
	}

	if( this.onDrawOverlay )
		this.onDrawOverlay( ctx );

	if(this.dirty_area)
	{
		ctx.restore();
		//this.dirty_area = null;
	}

	if(ctx.finish2D) //this is a function I use in webgl renderer
		ctx.finish2D();
}

/**
* draws some useful stats in the corner of the canvas
* @method renderInfo
**/
LGraphCanvas.prototype.renderInfo = function( ctx, x, y )
{
	x = x || 0;
	y = y || 0;

	ctx.save();
	ctx.translate( x, y );

	ctx.font = "10px Arial";
	ctx.fillStyle = "#888";
	if(this.graph)
	{
		ctx.fillText( "T: " + this.graph.globaltime.toFixed(2)+"s",5,13*1 );
		ctx.fillText( "I: " + this.graph.iteration,5,13*2 );
		ctx.fillText( "N: " + this.graph._nodes.length + " [" + this.visible_nodes.length + "]",5,13*3  );
		ctx.fillText( "V: " + this.graph._version,5,13*4 );
		ctx.fillText( "FPS:" + this.fps.toFixed(2),5,13*5 );
	}
	else
		ctx.fillText( "No graph selected",5,13*1 );
	ctx.restore();
}

/**
* draws the back canvas (the one containing the background and the connections)
* @method drawBackCanvas
**/
LGraphCanvas.prototype.drawBackCanvas = function()
{
	var canvas = this.bgcanvas;
	if(canvas.width != this.canvas.width ||
		canvas.height != this.canvas.height)
	{
		canvas.width = this.canvas.width;
		canvas.height = this.canvas.height;
	}

	if(!this.bgctx)
		this.bgctx = this.bgcanvas.getContext("2d");
	var ctx = this.bgctx;
	if(ctx.start)
		ctx.start();

	//clear
	if(this.clear_background)
		ctx.clearRect(0,0,canvas.width, canvas.height);

	if(this._graph_stack && this._graph_stack.length)
	{
		ctx.save();
		var parent_graph = this._graph_stack[ this._graph_stack.length - 1];
		var subgraph_node = this.graph._subgraph_node;
		ctx.strokeStyle = subgraph_node.bgcolor;
		ctx.lineWidth = 10;
		ctx.strokeRect(1,1,canvas.width-2,canvas.height-2);
		ctx.lineWidth = 1;
		ctx.font = "40px Arial"
		ctx.textAlign = "center";
		ctx.fillStyle = subgraph_node.bgcolor;
		var title = "";
		for(var i = 1; i < this._graph_stack.length; ++i)
			title += this._graph_stack[i]._subgraph_node.getTitle() + " >> ";
		ctx.fillText( title + subgraph_node.getTitle(), canvas.width * 0.5, 40 );
		ctx.restore();
	}

	var bg_already_painted = false;
	if(this.onRenderBackground)
		bg_already_painted = this.onRenderBackground( canvas, ctx );

	//reset in case of error
	ctx.restore();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	this.visible_links.length = 0;

	if(this.graph)
	{
		//apply transformations
		ctx.save();
		ctx.scale(this.scale,this.scale);
		ctx.translate(this.offset[0],this.offset[1]);

		//render BG
		if(this.background_image && this.scale > 0.5 && !bg_already_painted)
		{
			if (this.zoom_modify_alpha)
				ctx.globalAlpha = (1.0 - 0.5 / this.scale) * this.editor_alpha;
			else
				ctx.globalAlpha = this.editor_alpha;
			ctx.imageSmoothingEnabled = ctx.mozImageSmoothingEnabled = ctx.imageSmoothingEnabled = false;
			if(!this._bg_img || this._bg_img.name != this.background_image)
			{
				this._bg_img = new Image();
				this._bg_img.name = this.background_image;
				this._bg_img.src = this.background_image;
				var that = this;
				this._bg_img.onload = function() {
					that.draw(true,true);
				}
			}

			var pattern = null;
			if(this._pattern == null && this._bg_img.width > 0)
			{
				pattern = ctx.createPattern( this._bg_img, 'repeat' );
				this._pattern_img = this._bg_img;
				this._pattern = pattern;
			}
			else
				pattern = this._pattern;
			if(pattern)
			{
				ctx.fillStyle = pattern;
				ctx.fillRect(this.visible_area[0],this.visible_area[1],this.visible_area[2],this.visible_area[3]);
				ctx.fillStyle = "transparent";
			}

			ctx.globalAlpha = 1.0;
			ctx.imageSmoothingEnabled = ctx.mozImageSmoothingEnabled = ctx.imageSmoothingEnabled = true;
		}

		//groups
		if(this.graph._groups.length && !this.live_mode)
			this.drawGroups(canvas, ctx);

		if( this.onDrawBackground )
			this.onDrawBackground( ctx, this.visible_area );
		if( this.onBackgroundRender ) //LEGACY
		{
			console.error("WARNING! onBackgroundRender deprecated, now is named onDrawBackground ");
			this.onBackgroundRender = null;
		}

		//DEBUG: show clipping area
		//ctx.fillStyle = "red";
		//ctx.fillRect( this.visible_area[0] + 10, this.visible_area[1] + 10, this.visible_area[2] - 20, this.visible_area[3] - 20);

		//bg
		if (this.render_canvas_border) {
			ctx.strokeStyle = "#235";
			ctx.strokeRect(0,0,canvas.width,canvas.height);
		}

		if(this.render_connections_shadows)
		{
			ctx.shadowColor = "#000";
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 0;
			ctx.shadowBlur = 6;
		}
		else
			ctx.shadowColor = "rgba(0,0,0,0)";

		//draw connections
		if(!this.live_mode)
			this.drawConnections(ctx);

		ctx.shadowColor = "rgba(0,0,0,0)";

		//restore state
		ctx.restore();
	}

	if(ctx.finish)
		ctx.finish();

	this.dirty_bgcanvas = false;
	this.dirty_canvas = true; //to force to repaint the front canvas with the bgcanvas
}

var temp_vec2 = new Float32Array(2);

/**
* draws the given node inside the canvas
* @method drawNode
**/
LGraphCanvas.prototype.drawNode = function(node, ctx )
{
	var glow = false;
	this.current_node = node;

	var color = node.color || node.constructor.color || LiteGraph.NODE_DEFAULT_COLOR;
	var bgcolor = node.bgcolor || node.constructor.bgcolor || LiteGraph.NODE_DEFAULT_BGCOLOR;

	//shadow and glow
	if (node.mouseOver)
		glow = true;

	//only render if it forces it to do it
	if(this.live_mode)
	{
		if(!node.flags.collapsed)
		{
			ctx.shadowColor = "transparent";
			if(node.onDrawForeground)
				node.onDrawForeground(ctx, this, this.canvas );
		}

		return;
	}

	var editor_alpha = this.editor_alpha;
	ctx.globalAlpha = editor_alpha;

	if(this.render_shadows)
	{
		ctx.shadowColor = LiteGraph.DEFAULT_SHADOW_COLOR;
		ctx.shadowOffsetX = 2 * this.scale;
		ctx.shadowOffsetY = 2 * this.scale;
		ctx.shadowBlur = 3 * this.scale;
	}
	else
		ctx.shadowColor = "transparent";

	//custom draw collapsed method (draw after shadows because they are affected)
	if(node.flags.collapsed && node.onDrawCollaped && node.onDrawCollapsed(ctx, this) == true)
		return;

	//clip if required (mask)
	var shape = node._shape || LiteGraph.BOX_SHAPE;
	var size = temp_vec2;
	temp_vec2.set( node.size );
	var horizontal = node.horizontal;// || node.flags.horizontal;

	if( node.flags.collapsed )
	{
		ctx.font = this.inner_text_font;
		var title = node.getTitle ? node.getTitle() : node.title;
		node._collapsed_width = Math.min( node.size[0], ctx.measureText(title).width + 40 );//LiteGraph.NODE_COLLAPSED_WIDTH;
		size[0] = node._collapsed_width;
		size[1] = 0;
	}
	
	if( node.clip_area ) //Start clipping
	{
		ctx.save();
		ctx.beginPath();
		if(shape == LiteGraph.BOX_SHAPE)
			ctx.rect(0,0,size[0], size[1]);
		else if (shape == LiteGraph.ROUND_SHAPE)
			ctx.roundRect(0,0,size[0], size[1],10);
		else if (shape == LiteGraph.CIRCLE_SHAPE)
			ctx.arc(size[0] * 0.5, size[1] * 0.5, size[0] * 0.5, 0, Math.PI*2);
		ctx.clip();
	}

	//draw shape
	if( node.has_errors )
		bgcolor = "red";
	this.drawNodeShape( node, ctx, size, color, bgcolor, node.is_selected, node.mouseOver );
	ctx.shadowColor = "transparent";

	//connection slots
	ctx.textAlign = horizontal ? "center" : "left";
	ctx.font = this.inner_text_font;

	var render_text = this.scale > 0.6;

	var out_slot = this.connecting_output;
	ctx.lineWidth = 1;

	var max_y = 0;
	var slot_pos = new Float32Array(2); //to reuse

	//render inputs and outputs
	if(!node.flags.collapsed)
	{
		//input connection slots
		if(node.inputs)
			for(var i = 0; i < node.inputs.length; i++)
			{
				var slot = node.inputs[i];

				ctx.globalAlpha = editor_alpha;
				//change opacity of incompatible slots when dragging a connection
				if ( this.connecting_node && LiteGraph.isValidConnection( slot.type && out_slot.type ) )
					ctx.globalAlpha = 0.4 * editor_alpha;

				ctx.fillStyle = slot.link != null ? (slot.color_on || this.default_connection_color.input_on) : (slot.color_off || this.default_connection_color.input_off);

				var pos = node.getConnectionPos( true, i, slot_pos );
				pos[0] -= node.pos[0];
				pos[1] -= node.pos[1];
				if( max_y < pos[1] + LiteGraph.NODE_SLOT_HEIGHT*0.5 )
					max_y = pos[1] + LiteGraph.NODE_SLOT_HEIGHT*0.5;

				ctx.beginPath();

				if (slot.type === LiteGraph.EVENT || slot.shape === LiteGraph.BOX_SHAPE)
				{
					if (horizontal)
	                    ctx.rect((pos[0] - 5) + 0.5, (pos[1] - 8) + 0.5, 10, 14);
					else
	                    ctx.rect((pos[0] - 6) + 0.5, (pos[1] - 5) + 0.5, 14, 10);
                } else if (slot.shape === LiteGraph.ARROW_SHAPE) {
                    ctx.moveTo(pos[0] + 8, pos[1] + 0.5);
                    ctx.lineTo(pos[0] - 4, (pos[1] + 6) + 0.5);
                    ctx.lineTo(pos[0] - 4, (pos[1] - 6) + 0.5);
                    ctx.closePath();
                } else {
                    ctx.arc(pos[0], pos[1], 4, 0, Math.PI * 2);
                }

				ctx.fill();

				//render name
				if(render_text)
				{
					var text = slot.label != null ? slot.label : slot.name;
					if(text)
					{
						ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
						if( horizontal || slot.dir == LiteGraph.UP )
							ctx.fillText(text,pos[0],pos[1] - 10);
						else
							ctx.fillText(text,pos[0] + 10,pos[1] + 5);
					}
				}
			}

		//output connection slots
		if(this.connecting_node)
			ctx.globalAlpha = 0.4 * editor_alpha;

		ctx.textAlign = horizontal ? "center" : "right";
		ctx.strokeStyle = "black";
		if(node.outputs)
			for(var i = 0; i < node.outputs.length; i++)
			{
				var slot = node.outputs[i];

				var pos = node.getConnectionPos(false,i, slot_pos );
				pos[0] -= node.pos[0];
				pos[1] -= node.pos[1];
				if( max_y < pos[1] + LiteGraph.NODE_SLOT_HEIGHT*0.5)
					max_y = pos[1] + LiteGraph.NODE_SLOT_HEIGHT*0.5;

				ctx.fillStyle = slot.links && slot.links.length ? (slot.color_on || this.default_connection_color.output_on) : (slot.color_off || this.default_connection_color.output_off);
				ctx.beginPath();
				//ctx.rect( node.size[0] - 14,i*14,10,10);

				if (slot.type === LiteGraph.EVENT || slot.shape === LiteGraph.BOX_SHAPE)
				{
					if( horizontal )
						ctx.rect((pos[0] - 5) + 0.5,(pos[1] - 8) + 0.5,10,14);
					else
						ctx.rect((pos[0] - 6) + 0.5,(pos[1] - 5) + 0.5,14,10);
                } else if (slot.shape === LiteGraph.ARROW_SHAPE) {
                    ctx.moveTo(pos[0] + 8, pos[1] + 0.5);
                    ctx.lineTo(pos[0] - 4, (pos[1] + 6) + 0.5);
                    ctx.lineTo(pos[0] - 4, (pos[1] - 6) + 0.5);
                    ctx.closePath();
                } else {
                    ctx.arc(pos[0], pos[1], 4, 0, Math.PI * 2);
                }

				//trigger
				//if(slot.node_id != null && slot.slot == -1)
				//	ctx.fillStyle = "#F85";

				//if(slot.links != null && slot.links.length)
				ctx.fill();
				ctx.stroke();

				//render output name
				if(render_text)
				{
					var text = slot.label != null ? slot.label : slot.name;
					if(text)
					{
						ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
						if( horizontal || slot.dir == LiteGraph.DOWN )
							ctx.fillText(text,pos[0],pos[1] - 8);
						else
							ctx.fillText(text, pos[0] - 10,pos[1] + 5);
					}
				}
			}

		ctx.textAlign = "left";
		ctx.globalAlpha = 1;

		if(node.widgets)
		{
			if( horizontal || node.widgets_up  )
				max_y = 2;
			this.drawNodeWidgets( node, max_y, ctx, (this.node_widget && this.node_widget[0] == node) ? this.node_widget[1] : null );
		}

		//draw foreground
		if(node.onDrawForeground)
			node.onDrawForeground( ctx, this, this.canvas );
	}
	else //if collapsed
	{
		var input_slot = null;
		var output_slot = null;

		//get first connected slot to render
		if(node.inputs)
		{
			for(var i = 0; i < node.inputs.length; i++)
			{
				var slot = node.inputs[i];
				if( slot.link == null )
					continue;
				input_slot = slot;
				break;
			}
		}
		if(node.outputs)
		{
			for(var i = 0; i < node.outputs.length; i++)
			{
				var slot = node.outputs[i];
				if(!slot.links || !slot.links.length)
					continue;
				output_slot = slot;
			}
		}

		if(input_slot)
		{
			var x = 0;
			var y = LiteGraph.NODE_TITLE_HEIGHT * -0.5; //center
			if( horizontal )
			{
				x = node._collapsed_width * 0.5;
				y = -LiteGraph.NODE_TITLE_HEIGHT;		
			}
			ctx.fillStyle = slot.color_on || this.default_connection_color.input_on;
			ctx.beginPath();
			if ( slot.type === LiteGraph.EVENT || slot.shape === LiteGraph.BOX_SHAPE) {
				ctx.rect(x - 7 + 0.5, y + 4 - LiteGraph.NODE_TITLE_HEIGHT * 0.5 + 0.5,14,LiteGraph.NODE_TITLE_HEIGHT - 8);
			} else if (slot.shape === LiteGraph.ARROW_SHAPE) {
				ctx.moveTo(x + 8, y);
				ctx.lineTo(x + -4, y - 4);
				ctx.lineTo(x + -4, y + 4);
				ctx.closePath();
			} else {
				ctx.arc(x, y, 4, 0, Math.PI * 2);
			}
			ctx.fill();
		}

		if(output_slot)
		{
			var x = node._collapsed_width;
			var y = LiteGraph.NODE_TITLE_HEIGHT * -0.5; //center
			if( horizontal )
			{
				x = node._collapsed_width * 0.5;
				y = 0;
			}
			ctx.fillStyle = slot.color_on || this.default_connection_color.output_on;
			ctx.strokeStyle = "black";
			ctx.beginPath();
			if (slot.type === LiteGraph.EVENT || slot.shape === LiteGraph.BOX_SHAPE) {
				ctx.rect( x - 7 + 0.5, y + 4 - LiteGraph.NODE_TITLE_HEIGHT * 0.5 + 0.5,14,LiteGraph.NODE_TITLE_HEIGHT - 8);
			} else if (slot.shape === LiteGraph.ARROW_SHAPE) {
				ctx.moveTo(x + 6, y);
				ctx.lineTo(x - 6, y - 4);
				ctx.lineTo(x - 6, y + 4);
				ctx.closePath();
			} else {
				ctx.arc(x, y, 4, 0, Math.PI * 2);
			}
			ctx.fill();
			ctx.stroke();
		}
	}

	if(node.clip_area)
		ctx.restore();

	ctx.globalAlpha = 1.0;
}

/**
* draws the shape of the given node in the canvas
* @method drawNodeShape
**/
var tmp_area = new Float32Array(4);

LGraphCanvas.prototype.drawNodeShape = function( node, ctx, size, fgcolor, bgcolor, selected, mouse_over )
{
	//bg rect
	ctx.strokeStyle = fgcolor;
	ctx.fillStyle = bgcolor;

	var title_height = LiteGraph.NODE_TITLE_HEIGHT;

	//render node area depending on shape
	var shape = node._shape || node.constructor.shape || LiteGraph.BOX_SHAPE;
	var title_mode = node.constructor.title_mode;

	var render_title = true;
	if( title_mode == LiteGraph.TRANSPARENT_TITLE )
		render_title = false;
	else if( title_mode == LiteGraph.AUTOHIDE_TITLE && mouse_over)
		render_title = true;

	var area = tmp_area;
	area[0] = 0; //x
	area[1] = render_title ? -title_height : 0; //y
	area[2] = size[0]+1; //w
	area[3] = render_title ? size[1] + title_height : size[1]; //h

	//full node shape
	if(!node.flags.collapsed)
	{
		ctx.beginPath();
		if(shape == LiteGraph.BOX_SHAPE || this.scale < 0.5)
			ctx.fillRect( area[0], area[1], area[2], area[3] );
		else if (shape == LiteGraph.ROUND_SHAPE || shape == LiteGraph.CARD_SHAPE)
			ctx.roundRect( area[0], area[1], area[2], area[3], this.round_radius, shape == LiteGraph.CARD_SHAPE ? 0 : this.round_radius);
		else if (shape == LiteGraph.CIRCLE_SHAPE)
			ctx.arc(size[0] * 0.5, size[1] * 0.5, size[0] * 0.5, 0, Math.PI*2);
		ctx.fill();
	}
	ctx.shadowColor = "transparent";

	//image
	if (node.bgImage && node.bgImage.width)
		ctx.drawImage( node.bgImage, (size[0] - node.bgImage.width) * 0.5 , (size[1] - node.bgImage.height) * 0.5);

	if(node.bgImageUrl && !node.bgImage)
		node.bgImage = node.loadImage(node.bgImageUrl);

	if( node.onDrawBackground )
		node.onDrawBackground( ctx, this, this.canvas );

	//title bg (remember, it is rendered ABOVE the node)
	if(render_title || title_mode == LiteGraph.TRANSPARENT_TITLE )
	{
		//title bar
		if(node.onDrawTitleBar)
		{
			node.onDrawTitleBar(ctx, title_height, size, this.scale, fgcolor);
		}
		else if(title_mode != LiteGraph.TRANSPARENT_TITLE) //!node.flags.collapsed)
		{
			if(node.flags.collapsed)
				ctx.shadowColor = LiteGraph.DEFAULT_SHADOW_COLOR;
	
			//* gradient test
			if(this.use_gradients)
			{
				var grad = LGraphCanvas.gradients[ fgcolor ];
				if(!grad)
				{
					grad = LGraphCanvas.gradients[ fgcolor ] = ctx.createLinearGradient(0,0,400,0);
					grad.addColorStop(0, fgcolor);
					grad.addColorStop(1, "#000");
				}
				ctx.fillStyle = grad;
			}
			else
				ctx.fillStyle = fgcolor;

			var old_alpha = ctx.globalAlpha;
			//ctx.globalAlpha = 0.5 * old_alpha;
			ctx.beginPath();
			if(shape == LiteGraph.BOX_SHAPE || this.scale < 0.5)
				ctx.rect(0, -title_height, size[0]+1, title_height);
			else if ( shape == LiteGraph.ROUND_SHAPE || shape == LiteGraph.CARD_SHAPE )
				ctx.roundRect(0,-title_height,size[0]+1, title_height, this.round_radius, node.flags.collapsed ? this.round_radius : 0);
			ctx.fill();
			ctx.shadowColor = "transparent";
		}

		//title box
		if(node.onDrawTitleBox)
		{
			node.onDrawTitleBox( ctx, title_height, size, this.scale );
		}
		else if ( shape == LiteGraph.ROUND_SHAPE || shape == LiteGraph.CIRCLE_SHAPE || shape == LiteGraph.CARD_SHAPE )
		{
			if( this.scale > 0.5 )
			{
				ctx.fillStyle = "black";
				ctx.beginPath();
				ctx.arc(title_height *0.5, title_height * -0.5, (title_height - 8) *0.5,0,Math.PI*2);
				ctx.fill();
			}

			ctx.fillStyle = node.boxcolor || LiteGraph.NODE_DEFAULT_BOXCOLOR;
			ctx.beginPath();
			ctx.arc(title_height *0.5, title_height * -0.5, (title_height - 8) *0.4,0,Math.PI*2);
			ctx.fill();
		}
		else
		{
			if( this.scale > 0.5 )
			{
				ctx.fillStyle = "black";
				ctx.fillRect(4,-title_height + 4,title_height - 8,title_height - 8);
			}
			ctx.fillStyle = node.boxcolor || LiteGraph.NODE_DEFAULT_BOXCOLOR;
			ctx.fillRect(5,-title_height + 5,title_height - 10,title_height - 10);
		}
		ctx.globalAlpha = old_alpha;

		//title text
		if(node.onDrawTitleText)
		{
			node.onDrawTitleText(ctx, title_height, size, this.scale, this.title_text_font, selected);
		}
		if( this.scale > 0.5 )
		{
			ctx.font = this.title_text_font;
			var title = node.getTitle();
			if(title)
			{
				if(selected)
					ctx.fillStyle = "white";
				else
					ctx.fillStyle = node.constructor.title_text_color || this.node_title_color;
				if( node.flags.collapsed )
				{
					ctx.textAlign =  "center";
					var measure = ctx.measureText(title);
					ctx.fillText( title, title_height + measure.width * 0.5, -title_height * 0.2 );
					ctx.textAlign =  "left";
				}
				else
				{
					ctx.textAlign =  "left";
					ctx.fillText( title, title_height, -title_height * 0.2 );
				}
			}
		}

		if(node.onDrawTitle)
			node.onDrawTitle(ctx);
	}

	//render selection marker
	if(selected)
	{
		if( node.onBounding )
			node.onBounding( area );

		if( title_mode == LiteGraph.TRANSPARENT_TITLE )
		{
			area[1] -= title_height;
			area[3] += title_height;
		}
		ctx.lineWidth = 1;
		ctx.globalAlpha = 0.8;
		ctx.beginPath();
		if(shape == LiteGraph.BOX_SHAPE)
			ctx.rect(-6 + area[0],-6 + area[1], 12 + area[2], 12 + area[3] );
		else if (shape == LiteGraph.ROUND_SHAPE || (shape == LiteGraph.CARD_SHAPE && node.flags.collapsed) )
			ctx.roundRect(-6 + area[0],-6 + area[1], 12 + area[2], 12 + area[3] , this.round_radius * 2);
		else if (shape == LiteGraph.CARD_SHAPE)
			ctx.roundRect(-6 + area[0],-6 + area[1], 12 + area[2], 12 + area[3] , this.round_radius * 2, 2);
		else if (shape == LiteGraph.CIRCLE_SHAPE)
			ctx.arc(size[0] * 0.5, size[1] * 0.5, size[0] * 0.5 + 6, 0, Math.PI*2);
		ctx.strokeStyle = "#FFF";
		ctx.stroke();
		ctx.strokeStyle = fgcolor;
		ctx.globalAlpha = 1;
	}
}

/**
* draws every connection visible in the canvas
* OPTIMIZE THIS: precatch connections position instead of recomputing them every time
* @method drawConnections
**/
LGraphCanvas.prototype.drawConnections = function(ctx)
{
	var now = LiteGraph.getTime();
	var visible_area = this.visible_area;
	var margin_area = new Float32Array([visible_area[0] - 20, visible_area[1] - 20, visible_area[2] + 40, visible_area[3] + 40 ]);
	var link_bounding = new Float32Array(4);
	var tempA = new Float32Array(2);
	var tempB = new Float32Array(2);

	//draw connections
	ctx.lineWidth = this.connections_width;

	ctx.fillStyle = "#AAA";
	ctx.strokeStyle = "#AAA";
	ctx.globalAlpha = this.editor_alpha;
	//for every node
	var nodes = this.graph._nodes;
	for (var n = 0, l = nodes.length; n < l; ++n)
	{
		var node = nodes[n];
		//for every input (we render just inputs because it is easier as every slot can only have one input)
		if(!node.inputs || !node.inputs.length)
			continue;
	
		for(var i = 0; i < node.inputs.length; ++i)
		{
			var input = node.inputs[i];
			if(!input || input.link == null)
				continue;
			var link_id = input.link;
			var link = this.graph.links[ link_id ];
			if(!link)
				continue;

			//find link info
			var start_node = this.graph.getNodeById( link.origin_id );
			if(start_node == null) continue;
			var start_node_slot = link.origin_slot;
			var start_node_slotpos = null;
			if(start_node_slot == -1)
				start_node_slotpos = [start_node.pos[0] + 10, start_node.pos[1] + 10];
			else
				start_node_slotpos = start_node.getConnectionPos( false, start_node_slot, tempA );
			var end_node_slotpos = node.getConnectionPos( true, i, tempB );

			//compute link bounding
			link_bounding[0] = start_node_slotpos[0];
			link_bounding[1] = start_node_slotpos[1];
			link_bounding[2] = end_node_slotpos[0] - start_node_slotpos[0];
			link_bounding[3] = end_node_slotpos[1] - start_node_slotpos[1];
			if( link_bounding[2] < 0 ){
				link_bounding[0] += link_bounding[2];
				link_bounding[2] = Math.abs( link_bounding[2] );
			}
			if( link_bounding[3] < 0 ){
				link_bounding[1] += link_bounding[3];
				link_bounding[3] = Math.abs( link_bounding[3] );
			}

			//skip links outside of the visible area of the canvas
			if( !overlapBounding( link_bounding, margin_area ) )
				continue;

			var start_slot = start_node.outputs[ start_node_slot ];
			var end_slot = node.inputs[i];
			if(!start_slot || !end_slot) continue;
			var start_dir = start_slot.dir || (start_node.horizontal ? LiteGraph.DOWN : LiteGraph.RIGHT);
			var end_dir = end_slot.dir || (node.horizontal ? LiteGraph.UP : LiteGraph.LEFT);

			this.renderLink( ctx, start_node_slotpos, end_node_slotpos, link, false, 0, null, start_dir, end_dir );

			//event triggered rendered on top
			if(link && link._last_time && (now - link._last_time) < 1000 )
			{
				var f = 2.0 - (now - link._last_time) * 0.002;
				var tmp = ctx.globalAlpha;
				ctx.globalAlpha = tmp * f;
				this.renderLink( ctx, start_node_slotpos, end_node_slotpos, link, true, f, "white", start_dir, end_dir );
				ctx.globalAlpha = tmp;
			}
		}
	}
	ctx.globalAlpha = 1;
}

/**
* draws a link between two points
* @method renderLink
* @param {vec2} a start pos
* @param {vec2} b end pos
* @param {Object} link the link object with all the link info
* @param {boolean} skip_border ignore the shadow of the link
* @param {boolean} flow show flow animation (for events)
* @param {string} color the color for the link
* @param {number} start_dir the direction enum 
* @param {number} end_dir the direction enum 
**/
LGraphCanvas.prototype.renderLink = function( ctx, a, b, link, skip_border, flow, color, start_dir, end_dir )
{
	if(link)
		this.visible_links.push( link );

	if(!this.highquality_render)
	{
		ctx.beginPath();
		ctx.moveTo(a[0],a[1]);
		ctx.lineTo(b[0],b[1]);
		ctx.stroke();

		if(link && link._pos)
		{
			link._pos[0] = (a[0] + b[0]) * 0.5;
			link._pos[1] = (a[1] + b[1]) * 0.5;
		}
		return;
	}

	start_dir = start_dir || LiteGraph.RIGHT;
	end_dir = end_dir || LiteGraph.LEFT;

	var dist = distance(a,b);

	if(this.render_connections_border && this.scale > 0.6)
		ctx.lineWidth = this.connections_width + 4;

	//choose color
	if( !color && link )
		color = link.color || LGraphCanvas.link_type_colors[ link.type ];
	if( !color )
		color = this.default_link_color;

	if( link != null && this.highlighted_links[ link.id ] )
		color = "#FFF";

	//begin line shape
	ctx.beginPath();

	if(this.render_curved_connections) //splines
	{
		ctx.moveTo(a[0],a[1]);
		var start_offset_x = 0;
		var start_offset_y = 0;
		var end_offset_x = 0;
		var end_offset_y = 0;
		switch(start_dir)
		{
			case LiteGraph.LEFT: start_offset_x = dist*-0.25; break;
			case LiteGraph.RIGHT: start_offset_x = dist*0.25; break;
			case LiteGraph.UP: start_offset_y = dist*-0.25; break;
			case LiteGraph.DOWN: start_offset_y = dist*0.25; break;
		}
		switch(end_dir)
		{
			case LiteGraph.LEFT: end_offset_x = dist*-0.25; break;
			case LiteGraph.RIGHT: end_offset_x = dist*0.25; break;
			case LiteGraph.UP: end_offset_y = dist*-0.25; break;
			case LiteGraph.DOWN: end_offset_y = dist*0.25; break;
		}
		ctx.bezierCurveTo(a[0] + start_offset_x, a[1] + start_offset_y,
							b[0] + end_offset_x , b[1] + end_offset_y,
							b[0], b[1] );
	}
	else //lines
	{
		ctx.moveTo(a[0]+10,a[1]);
		ctx.lineTo(((a[0]+10) + (b[0]-10))*0.5,a[1]);
		ctx.lineTo(((a[0]+10) + (b[0]-10))*0.5,b[1]);
		ctx.lineTo(b[0]-10,b[1]);
	}

	//rendering the outline of the connection can be a little bit slow
	if(this.render_connections_border && this.scale > 0.6 && !skip_border)
	{
		ctx.strokeStyle = "rgba(0,0,0,0.5)";
		ctx.stroke();
	}

	ctx.lineWidth = this.connections_width;
	ctx.fillStyle = ctx.strokeStyle = color;
	ctx.stroke();
	//end line shape

	var pos = this.computeConnectionPoint( a, b, 0.5, start_dir, end_dir );
	if(link && link._pos)
	{
		link._pos[0] = pos[0];
		link._pos[1] = pos[1];
	}

	//render arrow in the middle
	if( this.render_connection_arrows && this.scale >= 0.6 )
	{
		//render arrow
		if(this.render_connection_arrows && this.scale > 0.6)
		{
			//compute two points in the connection
			var posA = this.computeConnectionPoint( a, b, 0.25, start_dir, end_dir );
			var posB = this.computeConnectionPoint( a, b, 0.26, start_dir, end_dir );
			var posC = this.computeConnectionPoint( a, b, 0.75, start_dir, end_dir );
			var posD = this.computeConnectionPoint( a, b, 0.76, start_dir, end_dir );

			//compute the angle between them so the arrow points in the right direction
			var angleA = 0;
			var angleB = 0;
			if(this.render_curved_connections)
			{
				angleA = -Math.atan2( posB[0] - posA[0], posB[1] - posA[1]);
				angleB = -Math.atan2( posD[0] - posC[0], posD[1] - posC[1]);
			}
			else
				angleB = angleA = b[1] > a[1] ? 0 : Math.PI;

			//render arrow
			ctx.save();
			ctx.translate(posA[0],posA[1]);
			ctx.rotate(angleA);
			ctx.beginPath();
			ctx.moveTo(-5,-3);
			ctx.lineTo(0,+7);
			ctx.lineTo(+5,-3);
			ctx.fill();
			ctx.restore();
			ctx.save();
			ctx.translate(posC[0],posC[1]);
			ctx.rotate(angleB);
			ctx.beginPath();
			ctx.moveTo(-5,-3);
			ctx.lineTo(0,+7);
			ctx.lineTo(+5,-3);
			ctx.fill();
			ctx.restore();

			//circle
			ctx.beginPath();
			ctx.arc(pos[0],pos[1],5,0,Math.PI*2);
			ctx.fill();
		}
	}

	//render flowing points
	if(flow)
	{
		ctx.fillStyle = color;
		for(var i = 0; i < 5; ++i)
		{
			var f = (LiteGraph.getTime() * 0.001 + (i * 0.2)) % 1;
			var pos = this.computeConnectionPoint(a,b,f, start_dir, end_dir);
			ctx.beginPath();
			ctx.arc(pos[0],pos[1],5,0,2*Math.PI);
			ctx.fill();
		}
	}
}

LGraphCanvas.prototype.computeConnectionPoint = function(a,b,t,start_dir,end_dir)
{
	start_dir = start_dir || LiteGraph.RIGHT;
	end_dir = end_dir || LiteGraph.LEFT;

	var dist = distance(a,b);
	var p0 = a;
	var p1 = [ a[0], a[1] ];
	var p2 = [ b[0], b[1] ];
	var p3 = b;

	switch(start_dir)
	{
		case LiteGraph.LEFT: p1[0] += dist*-0.25; break;
		case LiteGraph.RIGHT: p1[0] += dist*0.25; break;
		case LiteGraph.UP: p1[1] += dist*-0.25; break;
		case LiteGraph.DOWN: p1[1] += dist*0.25; break;
	}
	switch(end_dir)
	{
		case LiteGraph.LEFT: p2[0] += dist*-0.25; break;
		case LiteGraph.RIGHT: p2[0] += dist*0.25; break;
		case LiteGraph.UP: p2[1] += dist*-0.25; break;
		case LiteGraph.DOWN: p2[1] += dist*0.25; break;
	}

	var c1 = (1-t)*(1-t)*(1-t);
	var c2 = 3*((1-t)*(1-t))*t;
	var c3 = 3*(1-t)*(t*t);
	var c4 = t*t*t;

	var x = c1*p0[0] + c2*p1[0] + c3*p2[0] + c4*p3[0];
	var y = c1*p0[1] + c2*p1[1] + c3*p2[1] + c4*p3[1];
	return [x,y];
}

LGraphCanvas.prototype.drawExecutionOrder = function(ctx)
{
	ctx.shadowColor = "transparent";
	ctx.globalAlpha = 0.25;

	ctx.textAlign = "center";
	ctx.strokeStyle = "white";
	ctx.globalAlpha = 0.75;

	var visible_nodes = this.visible_nodes;
	for (var i = 0; i < visible_nodes.length; ++i)
	{
		var node = visible_nodes[i];
		ctx.fillStyle = "black";
		ctx.fillRect( node.pos[0] - LiteGraph.NODE_TITLE_HEIGHT, node.pos[1] - LiteGraph.NODE_TITLE_HEIGHT, LiteGraph.NODE_TITLE_HEIGHT, LiteGraph.NODE_TITLE_HEIGHT );
		if(node.order == 0)
			ctx.strokeRect( node.pos[0] - LiteGraph.NODE_TITLE_HEIGHT + 0.5, node.pos[1] - LiteGraph.NODE_TITLE_HEIGHT + 0.5, LiteGraph.NODE_TITLE_HEIGHT, LiteGraph.NODE_TITLE_HEIGHT );
		ctx.fillStyle = "#FFF";
		ctx.fillText( node.order, node.pos[0] + LiteGraph.NODE_TITLE_HEIGHT * -0.5, node.pos[1] - 6 );
	}
	ctx.globalAlpha = 1;
}


/**
* draws the widgets stored inside a node
* @method drawNodeWidgets
**/
LGraphCanvas.prototype.drawNodeWidgets = function( node, posY, ctx, active_widget )
{
	if(!node.widgets || !node.widgets.length)
		return 0;
	var width = node.size[0];
	var widgets = node.widgets;
	posY += 2;
	var H = LiteGraph.NODE_WIDGET_HEIGHT;
	var show_text = this.scale > 0.5;
	ctx.save();
	ctx.globalAlpha = this.editor_alpha;

	for(var i = 0; i < widgets.length; ++i)
	{
		var w = widgets[i];
		var y = posY;
		if(w.y)
			y = w.y;
		w.last_y = y;
		ctx.strokeStyle = "#AAA";
		ctx.fillStyle = "#222";
		ctx.textAlign = "left";

		switch( w.type )
		{
			case "button": 
				if(w.clicked)
				{
					ctx.fillStyle = "#AAA";
					w.clicked = false;
					this.dirty_canvas = true;
				}
				ctx.fillRect(10,y,width-20,H);
				ctx.strokeRect(10,y,width-20,H);
				if(show_text)
				{
					ctx.textAlign = "center";
					ctx.fillStyle = "#AAA";
					ctx.fillText( w.name, width*0.5, y + H*0.7 );
				}
				break;
			case "toggle":
				ctx.textAlign = "left";
				ctx.strokeStyle = "#AAA";
				ctx.fillStyle = "#111";
				ctx.beginPath();
				ctx.roundRect( 10, posY, width - 20, H,H*0.5 );
				ctx.fill();
				ctx.stroke();
				ctx.fillStyle = w.value ? "#89A" : "#333";
				ctx.beginPath();
				ctx.arc( width - 20, y + H*0.5, H * 0.36, 0, Math.PI * 2 );
				ctx.fill();
				if(show_text)
				{
					ctx.fillStyle = "#999";
					if(w.name != null)
						ctx.fillText( w.name, 20, y + H*0.7 );
					ctx.fillStyle = w.value ? "#DDD" : "#888";
					ctx.textAlign = "right";
					ctx.fillText( w.value ? (w.options.on || "true") : (w.options.off || "false"), width - 30, y + H*0.7 );
				}
				break;
			case "slider": 
				ctx.fillStyle = "#111";
				ctx.fillRect(10,y,width-20,H);
				var range = w.options.max - w.options.min;
				var nvalue = (w.value - w.options.min) / range;
				ctx.fillStyle = active_widget == w ? "#89A" : "#678";
				ctx.fillRect(10,y,nvalue*(width-20),H);
				ctx.strokeRect(10,y,width-20,H);
				if( w.marker )
				{
					var marker_nvalue = (w.marker - w.options.min) / range;
					ctx.fillStyle = "#AA9";
					ctx.fillRect(10 + marker_nvalue*(width-20),y,2,H);
				}
				if(show_text)
				{
					ctx.textAlign = "center";
					ctx.fillStyle = "#DDD";
					ctx.fillText( w.name + "  " + Number(w.value).toFixed(3), width*0.5, y + H*0.7 );
				}
				break;
			case "number":
			case "combo":
				ctx.textAlign = "left";
				ctx.strokeStyle = "#AAA";
				ctx.fillStyle = "#111";
				ctx.beginPath();
				ctx.roundRect( 10, posY, width - 20, H,H*0.5 );
				ctx.fill();
				ctx.stroke();
				if(show_text)
				{
					ctx.fillStyle = "#AAA";
					ctx.beginPath();
					ctx.moveTo( 26, posY + 5 );
					ctx.lineTo( 16, posY + H*0.5 );
					ctx.lineTo( 26, posY + H - 5 );
					ctx.moveTo( width - 26, posY + 5 );
					ctx.lineTo( width - 16, posY + H*0.5 );
					ctx.lineTo( width - 26, posY + H - 5 );
					ctx.fill();
					ctx.fillStyle = "#999";
					ctx.fillText( w.name, 30, y + H*0.7 );
					ctx.fillStyle = "#DDD";
					ctx.textAlign = "right";
					if(w.type == "number")
						ctx.fillText( Number(w.value).toFixed( w.options.precision !== undefined ? w.options.precision : 3), width - 40, y + H*0.7 );
					else
						ctx.fillText( w.value, width - 40, y + H*0.7 );
				}
				break;
			case "string":
			case "text":
				ctx.textAlign = "left";
				ctx.strokeStyle = "#AAA";
				ctx.fillStyle = "#111";
				ctx.beginPath();
				ctx.roundRect( 10, posY, width - 20, H,H*0.5 );
				ctx.fill();
				ctx.stroke();
				if(show_text)
				{
					ctx.fillStyle = "#999";
					if(w.name != null)
						ctx.fillText( w.name, 20, y + H*0.7 );
					ctx.fillStyle = "#DDD";
					ctx.textAlign = "right";
					ctx.fillText( w.value, width - 20, y + H*0.7 );
				}
				break;
			default:
				if(w.draw)
					w.draw(ctx,node,w,y,H);
				break;
		}
		posY += H + 4;
	}
	ctx.restore();
}

/**
* process an event on widgets 
* @method processNodeWidgets
**/
LGraphCanvas.prototype.processNodeWidgets = function( node, pos, event, active_widget )
{
	if(!node.widgets || !node.widgets.length)
		return null;

	var x = pos[0] - node.pos[0];
	var y = pos[1] - node.pos[1];
	var width = node.size[0];
	var that = this;
	var ref_window = this.getCanvasWindow();

	for(var i = 0; i < node.widgets.length; ++i)
	{
		var w = node.widgets[i];
		if( w == active_widget || (x > 6 && x < (width - 12) && y > w.last_y && y < (w.last_y + LiteGraph.NODE_WIDGET_HEIGHT)) )
		{
			//inside widget
			switch( w.type )
			{
				case "button": 
					if(w.callback)
						setTimeout( function(){	w.callback( w, that, node, pos ); }, 20 );
					w.clicked = true;
					this.dirty_canvas = true;
					break;
				case "slider": 
					var range = w.options.max - w.options.min;
					var nvalue = Math.clamp( (x - 10) / (width - 20), 0, 1);
					w.value = w.options.min + (w.options.max - w.options.min) * nvalue;
					if(w.callback)
						setTimeout( function(){	w.callback( w.value, that, node, pos ); }, 20 );
					this.dirty_canvas = true;
					break;
				case "number": 
				case "combo": 
					if(event.type == "mousemove" && w.type == "number")
					{
						w.value += (event.deltaX * 0.1) * (w.options.step || 1);
						if(w.options.min != null && w.value < w.options.min)
							w.value = w.options.min;
						if(w.options.max != null && w.value > w.options.max)
							w.value = w.options.max;
					}
					else if( event.type == "mousedown" )
					{
						var values = w.options.values;
						if(values && values.constructor === Function)
							values = w.options.values( w, node );

						var delta = ( x < 40 ? -1 : ( x > width - 40 ? 1 : 0) );
						if (w.type == "number")
						{
							w.value += delta * 0.1 * (w.options.step || 1);
							if(w.options.min != null && w.value < w.options.min)
								w.value = w.options.min;
							if(w.options.max != null && w.value > w.options.max)
								w.value = w.options.max;
						}
						else if(delta)
						{
							var index = values.indexOf( w.value ) + delta;
							if( index >= values.length )
								index = 0;
							if( index < 0 )
								index = values.length - 1;
							w.value = values[ index ];
						}
						else
						{
							var menu = new LiteGraph.ContextMenu( values, { event: event, className: "dark", callback: inner_clicked.bind(w) }, ref_window );
							function inner_clicked( v, option, event )
							{
								this.value = v;
								that.dirty_canvas = true;
								return false;
							}
						}
					}
					if(w.callback)
						setTimeout( (function(){ this.callback( this.value, that, node, pos ); }).bind(w), 20 );
					this.dirty_canvas = true;
					break;
				case "toggle":
					if( event.type == "mousedown" )
					{
						w.value = !w.value;
						if(w.callback)
							setTimeout( function(){	w.callback( w.value, that, node, pos ); }, 20 );
					}
					break;
				case "string":
				case "text":
					if( event.type == "mousedown" )
						this.prompt( "Value", w.value, (function(v){ this.value = v; if(w.callback) w.callback(v, that, node ); }).bind(w), event );
					break;
				default: 
					if( w.mouse )
						w.mouse( ctx, event, [x,y], node );
					break;
			}

			return w;
		}
	}
	return null;
}

/**
* draws every group area in the background
* @method drawGroups
**/
LGraphCanvas.prototype.drawGroups = function(canvas, ctx)
{
	if(!this.graph)
		return;

	var groups = this.graph._groups;

	ctx.save();
	ctx.globalAlpha = 0.5 * this.editor_alpha;

	for(var i = 0; i < groups.length; ++i)
	{
		var group = groups[i];

		if(!overlapBounding( this.visible_area, group._bounding ))
			continue; //out of the visible area

		ctx.fillStyle = group.color || "#335";
		ctx.strokeStyle = group.color || "#335";
		var pos = group._pos;
		var size = group._size;
		ctx.globalAlpha = 0.25 * this.editor_alpha;
		ctx.beginPath();
		ctx.rect( pos[0] + 0.5, pos[1] + 0.5, size[0], size[1] );
		ctx.fill();
		ctx.globalAlpha = this.editor_alpha;;
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo( pos[0] + size[0], pos[1] + size[1] );
		ctx.lineTo( pos[0] + size[0] - 10, pos[1] + size[1] );
		ctx.lineTo( pos[0] + size[0], pos[1] + size[1] - 10 );
		ctx.fill();

		var font_size = (group.font_size || LiteGraph.DEFAULT_GROUP_FONT_SIZE);
		ctx.font = font_size + "px Arial";
		ctx.fillText( group.title, pos[0] + 4, pos[1] + font_size );
	}

	ctx.restore();
}

/**
* resizes the canvas to a given size, if no size is passed, then it tries to fill the parentNode
* @method resize
**/
LGraphCanvas.prototype.resize = function(width, height)
{
	if(!width && !height)
	{
		var parent = this.canvas.parentNode;
		width = parent.offsetWidth;
		height = parent.offsetHeight;
	}

	if(this.canvas.width == width && this.canvas.height == height)
		return;

	this.canvas.width = width;
	this.canvas.height = height;
	this.bgcanvas.width = this.canvas.width;
	this.bgcanvas.height = this.canvas.height;
	this.setDirty(true,true);
}

/**
* switches to live mode (node shapes are not rendered, only the content)
* this feature was designed when graphs where meant to create user interfaces
* @method switchLiveMode
**/
LGraphCanvas.prototype.switchLiveMode = function(transition)
{
	if(!transition)
	{
		this.live_mode = !this.live_mode;
		this.dirty_canvas = true;
		this.dirty_bgcanvas = true;
		return;
	}

	var self = this;
	var delta = this.live_mode ? 1.1 : 0.9;
	if(this.live_mode)
	{
		this.live_mode = false;
		this.editor_alpha = 0.1;
	}

	var t = setInterval(function() {
		self.editor_alpha *= delta;
		self.dirty_canvas = true;
		self.dirty_bgcanvas = true;

		if(delta < 1  && self.editor_alpha < 0.01)
		{
			clearInterval(t);
			if(delta < 1)
				self.live_mode = true;
		}
		if(delta > 1 && self.editor_alpha > 0.99)
		{
			clearInterval(t);
			self.editor_alpha = 1;
		}
	},1);
}

LGraphCanvas.prototype.onNodeSelectionChange = function(node)
{
	return; //disabled
}

LGraphCanvas.prototype.touchHandler = function(event)
{
	//alert("foo");
    var touches = event.changedTouches,
        first = touches[0],
        type = "";

         switch(event.type)
    {
        case "touchstart": type = "mousedown"; break;
        case "touchmove":  type = "mousemove"; break;
        case "touchend":   type = "mouseup"; break;
        default: return;
    }

             //initMouseEvent(type, canBubble, cancelable, view, clickCount,
    //           screenX, screenY, clientX, clientY, ctrlKey,
    //           altKey, shiftKey, metaKey, button, relatedTarget);

	var window = this.getCanvasWindow();
	var document = window.document;

    var simulatedEvent = document.createEvent("MouseEvent");
    simulatedEvent.initMouseEvent(type, true, true, window, 1,
                              first.screenX, first.screenY,
                              first.clientX, first.clientY, false,
                              false, false, false, 0/*left*/, null);
	first.target.dispatchEvent(simulatedEvent);
    event.preventDefault();
}

/* CONTEXT MENU ********************/

LGraphCanvas.onGroupAdd = function(info,entry,mouse_event)
{
	var canvas = LGraphCanvas.active_canvas;
	var ref_window = canvas.getCanvasWindow();
		
	var group = new LiteGraph.LGraphGroup();
	group.pos = canvas.convertEventToCanvas( mouse_event );
	canvas.graph.add( group );
}

LGraphCanvas.onMenuAdd = function( node, options, e, prev_menu )
{
	var canvas = LGraphCanvas.active_canvas;
	var ref_window = canvas.getCanvasWindow();

	var values = LiteGraph.getNodeTypesCategories();
	var entries = [];
	for(var i in values)
		if(values[i])
			entries.push({ value: values[i], content: values[i], has_submenu: true });

	//show categories
	var menu = new LiteGraph.ContextMenu( entries, { event: e, callback: inner_clicked, parentMenu: prev_menu }, ref_window);

	function inner_clicked( v, option, e )
	{
		var category = v.value;
		var node_types = LiteGraph.getNodeTypesInCategory( category, canvas.filter );
		var values = [];
		for(var i in node_types)
			if (!node_types[i].skip_list)
				values.push( { content: node_types[i].title, value: node_types[i].type });

		new LiteGraph.ContextMenu( values, {event: e, callback: inner_create, parentMenu: menu }, ref_window);
		return false;
	}

	function inner_create( v, e )
	{
		var first_event = prev_menu.getFirstEvent();
		var node = LiteGraph.createNode( v.value );
		if(node)
		{
			node.pos = canvas.convertEventToCanvas( first_event );
			canvas.graph.add( node );
		}
	}

	return false;
}

LGraphCanvas.onMenuCollapseAll = function()
{

}


LGraphCanvas.onMenuNodeEdit = function()
{

}

LGraphCanvas.showMenuNodeOptionalInputs = function( v, options, e, prev_menu, node )
{
	if(!node)
		return;

	var that = this;
	var canvas = LGraphCanvas.active_canvas;
	var ref_window = canvas.getCanvasWindow();

	var options = node.optional_inputs;
	if(node.onGetInputs)
		options = node.onGetInputs();

	var entries = [];
	if(options)
		for (var i in options)
		{
			var entry = options[i];
			if(!entry)
			{
				entries.push(null);
				continue;
			}
			var label = entry[0];
			if(entry[2] && entry[2].label)
				label = entry[2].label;
			var data = {content: label, value: entry};
			if(entry[1] == LiteGraph.ACTION)
				data.className = "event";
			entries.push(data);
		}

	if(this.onMenuNodeInputs)
		entries = this.onMenuNodeInputs( entries );

	if(!entries.length)
		return;

	var menu = new LiteGraph.ContextMenu(entries, { event: e, callback: inner_clicked, parentMenu: prev_menu, node: node }, ref_window);

	function inner_clicked(v, e, prev)
	{
		if(!node)
			return;

		if(v.callback)
			v.callback.call( that, node, v, e, prev );

		if(v.value)
		{
			node.addInput(v.value[0],v.value[1], v.value[2]);
			node.setDirtyCanvas(true,true);
		}
	}

	return false;
}

LGraphCanvas.showMenuNodeOptionalOutputs = function( v, options, e, prev_menu, node )
{
	if(!node)
		return;

	var that = this;
	var canvas = LGraphCanvas.active_canvas;
	var ref_window = canvas.getCanvasWindow();

	var options = node.optional_outputs;
	if(node.onGetOutputs)
		options = node.onGetOutputs();

	var entries = [];
	if(options)
		for (var i in options)
		{
			var entry = options[i];
			if(!entry) //separator?
			{
				entries.push(null);
				continue;
			}

			if(node.flags && node.flags.skip_repeated_outputs && node.findOutputSlot(entry[0]) != -1)
				continue; //skip the ones already on
			var label = entry[0];
			if(entry[2] && entry[2].label)
				label = entry[2].label;
			var data = {content: label, value: entry};
			if(entry[1] == LiteGraph.EVENT)
				data.className = "event";
			entries.push(data);
		}

	if(this.onMenuNodeOutputs)
		entries = this.onMenuNodeOutputs( entries );

	if(!entries.length)
		return;

	var menu = new LiteGraph.ContextMenu(entries, {event: e, callback: inner_clicked, parentMenu: prev_menu, node: node }, ref_window);

	function inner_clicked( v, e, prev )
	{
		if(!node)
			return;

		if(v.callback)
			v.callback.call( that, node, v, e, prev );

		if(!v.value)
			return;

		var value = v.value[1];

		if(value && (value.constructor === Object || value.constructor === Array)) //submenu why?
		{
			var entries = [];
			for(var i in value)
				entries.push({ content: i, value: value[i]});
			new LiteGraph.ContextMenu( entries, { event: e, callback: inner_clicked, parentMenu: prev_menu, node: node });
			return false;
		}
		else
		{
			node.addOutput( v.value[0], v.value[1], v.value[2]);
			node.setDirtyCanvas(true,true);
		}

	}

	return false;
}

LGraphCanvas.onShowMenuNodeProperties = function( value, options, e, prev_menu, node )
{
	if(!node || !node.properties)
		return;

	var that = this;
	var canvas = LGraphCanvas.active_canvas;
	var ref_window = canvas.getCanvasWindow();

	var entries = [];
		for (var i in node.properties)
		{
			var value = node.properties[i] !== undefined ? node.properties[i] : " ";
			//value could contain invalid html characters, clean that
			value = LGraphCanvas.decodeHTML(value);
			entries.push({content: "<span class='property_name'>" + i + "</span>" + "<span class='property_value'>" + value + "</span>", value: i});
		}
	if(!entries.length)
		return;

	var menu = new LiteGraph.ContextMenu(entries, {event: e, callback: inner_clicked, parentMenu: prev_menu, allow_html: true, node: node },ref_window);

	function inner_clicked( v, options, e, prev )
	{
		if(!node)
			return;
		var rect = this.getBoundingClientRect();
		canvas.showEditPropertyValue( node, v.value, { position: [rect.left, rect.top] });
	}

	return false;
}

LGraphCanvas.decodeHTML = function( str )
{
	var e = document.createElement("div");
	e.innerText = str;
	return e.innerHTML;
}

LGraphCanvas.onResizeNode = function( value, options, e, menu, node )
{
	if(!node)
		return;
	node.size = node.computeSize();
	node.setDirtyCanvas(true,true);
}

LGraphCanvas.prototype.showLinkMenu = function( link, e )
{
	var that = this;

	new LiteGraph.ContextMenu(["Delete"], { event: e, callback: inner_clicked });

	function inner_clicked(v)
	{
		switch(v)
		{
			case "Delete": that.graph.removeLink( link.id ); break;
			default:
		}
	}

	return false;
}

LGraphCanvas.onShowPropertyEditor = function( item, options, e, menu, node )
{
	var input_html = "";
	var property = item.property || "title";
	var value = node[ property ];

	var dialog = document.createElement("div");
	dialog.className = "graphdialog";
	dialog.innerHTML = "<span class='name'></span><input autofocus type='text' class='value'/><button>OK</button>";
	var title = dialog.querySelector(".name");
	title.innerText = property;
	var input = dialog.querySelector("input");
	if(input)
	{
		input.value = value;
        input.addEventListener("blur", function(e){
            this.focus();
        });
		input.addEventListener("keydown", function(e){
			if(e.keyCode != 13)
				return;
			inner();
			e.preventDefault();
			e.stopPropagation();
		});
	}

	var graphcanvas = LGraphCanvas.active_canvas;
	var canvas = graphcanvas.canvas;

	var rect = canvas.getBoundingClientRect();
	var offsetx = -20;
	var offsety = -20;
	if(rect)
	{
		offsetx -= rect.left;
		offsety -= rect.top;
	}

	if( event )
	{
		dialog.style.left = (event.pageX + offsetx) + "px";
		dialog.style.top = (event.pageY + offsety)+ "px";
	}
	else
	{
		dialog.style.left = (canvas.width * 0.5 + offsetx) + "px";
		dialog.style.top = (canvas.height * 0.5 + offsety) + "px";
	}

	var button = dialog.querySelector("button");
	button.addEventListener("click", inner );
	canvas.parentNode.appendChild( dialog );

	function inner()
	{
		setValue( input.value );
	}

	function setValue(value)
	{
		if( item.type == "Number" )
			value = Number(value);
		else if( item.type == "Boolean" )
			value = Boolean(value);
		node[ property ] = value;
		dialog.parentNode.removeChild( dialog );
		node.setDirtyCanvas(true,true);
	}
}

LGraphCanvas.prototype.prompt = function( title, value, callback, event )
{
	var that = this;
	var input_html = "";
	title = title || "";

	var dialog = document.createElement("div");
	dialog.className = "graphdialog rounded";
	dialog.innerHTML = "<span class='name'></span> <input autofocus type='text' class='value'/><button class='rounded'>OK</button>";
	dialog.close = function()
	{
		that.prompt_box = null;
		dialog.parentNode.removeChild( dialog );
	}

	dialog.addEventListener("mouseleave",function(e){
		 dialog.close();
	});

	if(that.prompt_box)
		that.prompt_box.close();
	that.prompt_box = dialog;

	var first = null;
	var timeout = null;
	var selected = null;

	var name_element = dialog.querySelector(".name");
	name_element.innerText = title;
	var value_element = dialog.querySelector(".value");
	value_element.value = value;

	var input = dialog.querySelector("input");
	input.addEventListener("keydown", function(e){
		if(e.keyCode == 27) //ESC
			dialog.close();
		else if(e.keyCode == 13)
		{
			if( callback )
				callback( this.value );
			dialog.close();
		}
		else
			return;
		e.preventDefault();
		e.stopPropagation();
	});

	var button = dialog.querySelector("button");
	button.addEventListener("click", function(e){
		if( callback )
			callback( input.value );
		that.setDirty(true);
		dialog.close();		
	});

	var graphcanvas = LGraphCanvas.active_canvas;
	var canvas = graphcanvas.canvas;

	var rect = canvas.getBoundingClientRect();
	var offsetx = -20;
	var offsety = -20;
	if(rect)
	{
		offsetx -= rect.left;
		offsety -= rect.top;
	}

	if( event )
	{
		dialog.style.left = (event.pageX + offsetx) + "px";
		dialog.style.top = (event.pageY + offsety)+ "px";
	}
	else
	{
		dialog.style.left = (canvas.width * 0.5 + offsetx) + "px";
		dialog.style.top = (canvas.height * 0.5 + offsety) + "px";
	}

	canvas.parentNode.appendChild( dialog );
	setTimeout( function(){	input.focus(); },10 );

	return dialog;
}


LGraphCanvas.search_limit = -1;
LGraphCanvas.prototype.showSearchBox = function(event)
{
	var that = this;
	var input_html = "";

	var dialog = document.createElement("div");
	dialog.className = "litegraph litesearchbox graphdialog rounded";
	dialog.innerHTML = "<span class='name'>Search</span> <input autofocus type='text' class='value rounded'/><div class='helper'></div>";
	dialog.close = function()
	{
		that.search_box = null;
		setTimeout( function(){ that.canvas.focus(); },10 ); //important, if canvas loses focus keys wont be captured
		dialog.parentNode.removeChild( dialog );
	}

	dialog.addEventListener("mouseleave",function(e){
		 dialog.close();
	});

	if(that.search_box)
		that.search_box.close();
	that.search_box = dialog;

	var helper = dialog.querySelector(".helper");

	var first = null;
	var timeout = null;
	var selected = null;

	var input = dialog.querySelector("input");
	if(input)
	{
        input.addEventListener("blur", function(e){
            this.focus();
        });
		input.addEventListener("keydown", function(e){

			if(e.keyCode == 38) //UP
				changeSelection(false);
			else if(e.keyCode == 40) //DOWN
				changeSelection(true);
			else if(e.keyCode == 27) //ESC
				dialog.close();
			else if(e.keyCode == 13)
			{
				if(selected)
					select( selected.innerHTML )
				else if(first)
					select( first );
				else
					dialog.close();
			}
			else
			{
				if(timeout)
					clearInterval(timeout);
				timeout = setTimeout( refreshHelper, 10 );
				return;
			}
			e.preventDefault();
			e.stopPropagation();
		});
	}

	var graphcanvas = LGraphCanvas.active_canvas;
	var canvas = graphcanvas.canvas;

	var rect = canvas.getBoundingClientRect();
	var offsetx = -20;
	var offsety = -20;
	if(rect)
	{
		offsetx -= rect.left;
		offsety -= rect.top;
	}

	if( event )
	{
		dialog.style.left = (event.pageX + offsetx) + "px";
		dialog.style.top = (event.pageY + offsety)+ "px";
	}
	else
	{
		dialog.style.left = (canvas.width * 0.5 + offsetx) + "px";
		dialog.style.top = (canvas.height * 0.5 + offsety) + "px";
	}

	canvas.parentNode.appendChild( dialog );
	input.focus();

	function select( name )
	{
		if(name)
		{
			if( that.onSearchBoxSelection )
				that.onSearchBoxSelection( name, event, graphcanvas );
			else
			{
				var extra = LiteGraph.searchbox_extras[ name ];
				if( extra )
					name = extra.type;

				var node = LiteGraph.createNode( name );
				if(node)
				{
					node.pos = graphcanvas.convertEventToCanvas( event );
					graphcanvas.graph.add( node );
				}

				if( extra && extra.data )
				{
					if(extra.data.properties)
						for(var i in extra.data.properties)
							node.addProperty( extra.data.properties[i][0], extra.data.properties[i][0] );
					if(extra.data.inputs)
					{
						node.inputs = [];
						for(var i in extra.data.inputs)
							node.addOutput( extra.data.inputs[i][0],extra.data.inputs[i][1] );
					}
					if(extra.data.outputs)
					{
						node.outputs = [];
						for(var i in extra.data.outputs)
							node.addOutput( extra.data.outputs[i][0],extra.data.outputs[i][1] );
					}
					if(extra.data.title)
						node.title = extra.data.title;
					if(extra.data.json)
						node.configure( extra.data.json );
				}
			}
		}

		dialog.close();
	}

	function changeSelection( forward )
	{
		var prev = selected;
		if(selected)
			selected.classList.remove("selected");
		if(!selected)
			selected = forward ? helper.childNodes[0] : helper.childNodes[ helper.childNodes.length ];
		else
		{
			selected = forward ? selected.nextSibling : selected.previousSibling;
			if(!selected)
				selected = prev;
		}
		if(!selected)
			return;
		selected.classList.add("selected");
		selected.scrollIntoView();
	}

	function refreshHelper() {
        timeout = null;
        var str = input.value;
        first = null;
        helper.innerHTML = "";
        if (!str)
            return;

        if (that.onSearchBox) {
            var list = that.onSearchBox( help, str, graphcanvas );
			if(list)
				for( var i = 0; i < list.length; ++i )
					addResult( list[i] );
    	} else {
            var c = 0;
       		str = str.toLowerCase();
			//extras
			for(var i in LiteGraph.searchbox_extras)
			{
				var extra = LiteGraph.searchbox_extras[i];
				if( extra.desc.toLowerCase().indexOf(str) === -1 )
					continue;
				addResult( extra.desc, "searchbox_extra" );
				if(LGraphCanvas.search_limit !== -1 && c++ > LGraphCanvas.search_limit )
					break;
			}

        	if(Array.prototype.filter)//filter supported
			{
				//types
        		var keys = Object.keys( LiteGraph.registered_node_types );
        		var filtered = keys.filter(function (item) {
					return item.toLowerCase().indexOf(str) !== -1;
                });
        		for(var i = 0; i < filtered.length; i++)
				{
                    addResult(filtered[i]);
                    if(LGraphCanvas.search_limit !== -1 && c++ > LGraphCanvas.search_limit)
						break;
				}
			} else {
                for (var i in LiteGraph.registered_node_types)
				{
                    if (i.indexOf(str) != -1) {
                        addResult(i);
                        if(LGraphCanvas.search_limit !== -1 && c++ > LGraphCanvas.search_limit)
							break;
                    }
                }
            }
        }

		function addResult( type, className )
		{
			var help = document.createElement("div");
			if (!first)
				first = type;
			help.innerText = type;
			help.dataset["type"] = escape(type);
			help.className = "litegraph lite-search-item";
			if( className )
				help.className +=  " " + className;
			help.addEventListener("click", function (e) {
				select( unescape( this.dataset["type"] ) );
			});
			helper.appendChild(help);
		}
	}

	return dialog;
}

LGraphCanvas.prototype.showEditPropertyValue = function( node, property, options )
{
	if(!node || node.properties[ property ] === undefined )
		return;

	options = options || {};
	var that = this;

	var type = "string";

	if(node.properties[ property ] !== null)
		type = typeof(node.properties[ property ]);

	//for arrays
	if(type == "object")
	{
		if( node.properties[ property ].length )
			type = "array";
	}

	var info = null;
	if(node.getPropertyInfo)
		info = node.getPropertyInfo(property);
	if(node.properties_info)
	{
		for(var i = 0; i < node.properties_info.length; ++i)
		{
			if( node.properties_info[i].name == property )
			{
				info = node.properties_info[i];
				break;
			}
		}
	}

	if(info !== undefined && info !== null && info.type )
		type = info.type;

	var input_html = "";

	if(type == "string" || type == "number" || type == "array")
		input_html = "<input autofocus type='text' class='value'/>";
	else if(type == "enum" && info.values)
	{
		input_html = "<select autofocus type='text' class='value'>";
		for(var i in info.values)
		{
			var v = info.values.constructor === Array ? info.values[i] : i;
			input_html += "<option value='"+v+"' "+(v == node.properties[property] ? "selected" : "")+">"+info.values[i]+"</option>";
		}
		input_html += "</select>";
	}
	else if(type == "boolean")
	{
		input_html = "<input autofocus type='checkbox' class='value' "+(node.properties[property] ? "checked" : "")+"/>";
	}
	else
	{
		console.warn("unknown type: " + type );
		return;
	}

	var dialog = this.createDialog( "<span class='name'>" + property + "</span>"+input_html+"<button>OK</button>" , options );

	if(type == "enum" && info.values)
	{
		var input = dialog.querySelector("select");
		input.addEventListener("change", function(e){
			setValue( e.target.value );
			//var index = e.target.value;
			//setValue( e.options[e.selectedIndex].value );
		});
	}
	else if(type == "boolean")
	{
		var input = dialog.querySelector("input");
		if(input)
		{
			input.addEventListener("click", function(e){
				setValue( !!input.checked );
			});
		}
	}
	else
	{
		var input = dialog.querySelector("input");
		if(input)
		{
            input.addEventListener("blur", function(e){
                this.focus();
            });
			input.value = node.properties[ property ] !== undefined ? node.properties[ property ] : "";
			input.addEventListener("keydown", function(e){
				if(e.keyCode != 13)
					return;
				inner();
				e.preventDefault();
				e.stopPropagation();
			});
		}
	}

	var button = dialog.querySelector("button");
	button.addEventListener("click", inner );

	function inner()
	{
		setValue( input.value );
	}

	function setValue(value)
	{
		if(typeof( node.properties[ property ] ) == "number")
			value = Number(value);
		if(type == "array")
			value = value.split(",").map(Number);
		node.properties[ property ] = value;
		if(node._graph)
			node._graph._version++;
		if(node.onPropertyChanged)
			node.onPropertyChanged( property, value );
		dialog.close();
		node.setDirtyCanvas(true,true);
	}
}

LGraphCanvas.prototype.createDialog = function( html, options )
{
	options = options || {};

	var dialog = document.createElement("div");
	dialog.className = "graphdialog";
	dialog.innerHTML = html;

	var rect = this.canvas.getBoundingClientRect();
	var offsetx = -20;
	var offsety = -20;
	if(rect)
	{
		offsetx -= rect.left;
		offsety -= rect.top;
	}

	if( options.position )
	{
		offsetx += options.position[0];
		offsety += options.position[1];
	}
	else if( options.event )
	{
		offsetx += options.event.pageX;
		offsety += options.event.pageY;
	}
	else //centered
	{
		offsetx += this.canvas.width * 0.5;
		offsety += this.canvas.height * 0.5;
	}

	dialog.style.left = offsetx + "px";
	dialog.style.top = offsety + "px";

	this.canvas.parentNode.appendChild( dialog );

	dialog.close = function()
	{
		if(this.parentNode)
			this.parentNode.removeChild( this );
	}

	return dialog;
}

LGraphCanvas.onMenuNodeCollapse = function( value, options, e, menu, node )
{
	node.collapse();
}

LGraphCanvas.onMenuNodePin = function( value, options, e, menu, node )
{
	node.pin();
}

LGraphCanvas.onMenuNodeMode = function( value, options, e, menu, node )
{
	new LiteGraph.ContextMenu(["Always","On Event","On Trigger","Never"], {event: e, callback: inner_clicked, parentMenu: menu, node: node });

	function inner_clicked(v)
	{
		if(!node)
			return;
		switch(v)
		{
			case "On Event": node.mode = LiteGraph.ON_EVENT; break;
			case "On Trigger": node.mode = LiteGraph.ON_TRIGGER; break;
			case "Never": node.mode = LiteGraph.NEVER; break;
			case "Always":
			default:
				node.mode = LiteGraph.ALWAYS; break;
		}
	}

	return false;
}

LGraphCanvas.onMenuNodeColors = function( value, options, e, menu, node )
{
	if(!node)
		throw("no node for color");

	var values = [];
	values.push({ value:null, content:"<span style='display: block; padding-left: 4px;'>No color</span>" });

	for(var i in LGraphCanvas.node_colors)
	{
		var color = LGraphCanvas.node_colors[i];
		var value = { value:i, content:"<span style='display: block; color: #999; padding-left: 4px; border-left: 8px solid "+color.color+"; background-color:"+color.bgcolor+"'>"+i+"</span>" };
		values.push(value);
	}
	new LiteGraph.ContextMenu( values, { event: e, callback: inner_clicked, parentMenu: menu, node: node });

	function inner_clicked(v)
	{
		if(!node)
			return;

		var color = v.value ? LGraphCanvas.node_colors[ v.value ] : null;
		if(color)
		{
			if(node.constructor === LiteGraph.LGraphGroup)
				node.color = color.groupcolor;
			else
			{
				node.color = color.color;
				node.bgcolor = color.bgcolor;
			}
		}
		else
		{
			delete node.color;
			delete node.bgcolor;
		}
		node.setDirtyCanvas(true,true);
	}

	return false;
}

LGraphCanvas.onMenuNodeShapes = function( value, options, e, menu, node )
{
	if(!node)
		throw("no node passed");

	new LiteGraph.ContextMenu( LiteGraph.VALID_SHAPES, { event: e, callback: inner_clicked, parentMenu: menu, node: node });

	function inner_clicked(v)
	{
		if(!node)
			return;
		node.shape = v;
		node.setDirtyCanvas(true);
	}

	return false;
}

LGraphCanvas.onMenuNodeRemove = function( value, options, e, menu, node )
{
	if(!node)
		throw("no node passed");

	if(node.removable === false)
		return;

	node.graph.remove(node);
	node.setDirtyCanvas(true,true);
}

LGraphCanvas.onMenuNodeClone = function( value, options, e, menu, node )
{
	if(node.clonable == false) return;
	var newnode = node.clone();
	if(!newnode)
		return;
	newnode.pos = [node.pos[0]+5,node.pos[1]+5];
	node.graph.add(newnode);
	node.setDirtyCanvas(true,true);
}

LGraphCanvas.node_colors = {
	"red": { color:"#322", bgcolor:"#533", groupcolor: "#A88" },
	"brown": { color:"#332922", bgcolor:"#593930", groupcolor: "#b06634" },
	"green": { color:"#232", bgcolor:"#353", groupcolor: "#8A8" },
	"blue": { color:"#223", bgcolor:"#335", groupcolor: "#88A" },
	"pale_blue": { color:"#2a363b", bgcolor:"#3f5159", groupcolor: "#3f789e" },
	"cyan": { color:"#233", bgcolor:"#355", groupcolor: "#8AA" },
	"purple": { color:"#323", bgcolor:"#535", groupcolor: "#a1309b" },
	"yellow": { color:"#432", bgcolor:"#653", groupcolor: "#b58b2a" },
	"black": { color:"#222", bgcolor:"#000", groupcolor: "#444" }
};

LGraphCanvas.prototype.getCanvasMenuOptions = function()
{
	var options = null;
	if(this.getMenuOptions)
		options = this.getMenuOptions();
	else
	{
		options = [
			{ content:"Add Node", has_submenu: true, callback: LGraphCanvas.onMenuAdd },
			{ content:"Add Group", callback: LGraphCanvas.onGroupAdd }
			//{content:"Collapse All", callback: LGraphCanvas.onMenuCollapseAll }
		];

		if(this._graph_stack && this._graph_stack.length > 0)
			options.push(null,{content:"Close subgraph", callback: this.closeSubgraph.bind(this) });
	}

	if(this.getExtraMenuOptions)
	{
		var extra = this.getExtraMenuOptions(this,options);
		if(extra)
			options = options.concat( extra );
	}

	return options;
}

//called by processContextMenu to extract the menu list
LGraphCanvas.prototype.getNodeMenuOptions = function( node )
{
	var options = null;

	if(node.getMenuOptions)
		options = node.getMenuOptions(this);
	else
		options = [
			{content:"Inputs", has_submenu: true, disabled:true, callback: LGraphCanvas.showMenuNodeOptionalInputs },
			{content:"Outputs", has_submenu: true, disabled:true, callback: LGraphCanvas.showMenuNodeOptionalOutputs },
			null,
			{content:"Properties", has_submenu: true, callback: LGraphCanvas.onShowMenuNodeProperties },
			null,
			{content:"Title", callback: LGraphCanvas.onShowPropertyEditor },
			{content:"Mode", has_submenu: true, callback: LGraphCanvas.onMenuNodeMode },
			{content:"Resize", callback: LGraphCanvas.onResizeNode },
			{content:"Collapse", callback: LGraphCanvas.onMenuNodeCollapse },
			{content:"Pin", callback: LGraphCanvas.onMenuNodePin },
			{content:"Colors", has_submenu: true, callback: LGraphCanvas.onMenuNodeColors },
			{content:"Shapes", has_submenu: true, callback: LGraphCanvas.onMenuNodeShapes },
			null
		];

	if(node.onGetInputs)
	{
		var inputs = node.onGetInputs();
		if(inputs && inputs.length)
			options[0].disabled = false;
	}

	if(node.onGetOutputs)
	{
		var outputs = node.onGetOutputs();
		if(outputs && outputs.length )
			options[1].disabled = false;
	}

	if(node.getExtraMenuOptions)
	{
		var extra = node.getExtraMenuOptions(this);
		if(extra)
		{
			extra.push(null);
			options = extra.concat( options );
		}
	}

	if( node.clonable !== false )
			options.push({content:"Clone", callback: LGraphCanvas.onMenuNodeClone });
	if( node.removable !== false )
			options.push(null,{content:"Remove", callback: LGraphCanvas.onMenuNodeRemove });

	if(node.graph && node.graph.onGetNodeMenuOptions )
		node.graph.onGetNodeMenuOptions( options, node );

	return options;
}

LGraphCanvas.prototype.getGroupMenuOptions = function( node )
{
	var o = [
		{content:"Title", callback: LGraphCanvas.onShowPropertyEditor },
		{content:"Color", has_submenu: true, callback: LGraphCanvas.onMenuNodeColors },
		{content:"Font size", property: "font_size", type:"Number", callback: LGraphCanvas.onShowPropertyEditor },
		null,
		{content:"Remove", callback: LGraphCanvas.onMenuNodeRemove }
	];

	return o;
}

LGraphCanvas.prototype.processContextMenu = function( node, event )
{
	var that = this;
	var canvas = LGraphCanvas.active_canvas;
	var ref_window = canvas.getCanvasWindow();

	var menu_info = null;
	var options = { event: event, callback: inner_option_clicked, extra: node };

	//check if mouse is in input
	var slot = null;
	if(node)
	{
		slot = node.getSlotInPosition( event.canvasX, event.canvasY );
		LGraphCanvas.active_node = node;
	}

	if(slot) //on slot
	{
		menu_info = [];
		if(slot && slot.output && slot.output.links && slot.output.links.length)
			menu_info.push( { content: "Disconnect Links", slot: slot } );
		menu_info.push( slot.locked ? "Cannot remove"  : { content: "Remove Slot", slot: slot } );
		menu_info.push( slot.nameLocked ? "Cannot rename" : { content: "Rename Slot", slot: slot } );
		options.title = (slot.input ? slot.input.type : slot.output.type) || "*";
		if(slot.input && slot.input.type == LiteGraph.ACTION)
			options.title = "Action";
		if(slot.output && slot.output.type == LiteGraph.EVENT)
			options.title = "Event";
	}
	else
	{
		if( node ) //on node
			menu_info = this.getNodeMenuOptions(node);
		else 
		{
			menu_info = this.getCanvasMenuOptions();
			var group = this.graph.getGroupOnPos( event.canvasX, event.canvasY );
			if( group ) //on group
				menu_info.push(null,{content:"Edit Group", has_submenu: true, submenu: { title:"Group", extra: group, options: this.getGroupMenuOptions( group ) }});
		}
	}

	//show menu
	if(!menu_info)
		return;

	var menu = new LiteGraph.ContextMenu( menu_info, options, ref_window );

	function inner_option_clicked( v, options, e )
	{
		if(!v)
			return;

		if(v.content == "Remove Slot")
		{
			var info = v.slot;
			if(info.input)
				node.removeInput( info.slot );
			else if(info.output)
				node.removeOutput( info.slot );
			return;
		}
		else if(v.content == "Disconnect Links")
		{
			var info = v.slot;
			if(info.output)
				node.disconnectOutput( info.slot );
			else if(info.input)
				node.disconnectInput( info.slot );
			return;
		}
		else if( v.content == "Rename Slot")
		{
			var info = v.slot;
            var slot_info = info.input ? node.getInputInfo( info.slot ) : node.getOutputInfo( info.slot );
			var dialog = that.createDialog( "<span class='name'>Name</span><input autofocus type='text'/><button>OK</button>" , options );
			var input = dialog.querySelector("input");
			if(input && slot_info){
				input.value = slot_info.label;
			}
			dialog.querySelector("button").addEventListener("click",function(e){
				if(input.value)
				{
					if( slot_info )
						slot_info.label = input.value;
					that.setDirty(true);
				}
				dialog.close();
			});
		}

		//if(v.callback)
		//	return v.callback.call(that, node, options, e, menu, that, event );
	}
}






//API *************************************************
//like rect but rounded corners
if(this.CanvasRenderingContext2D)
CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius, radius_low) {
  if ( radius === undefined ) {
    radius = 5;
  }

  if(radius_low === undefined)
	 radius_low  = radius;

  this.moveTo(x + radius, y);
  this.lineTo(x + width - radius, y);
  this.quadraticCurveTo(x + width, y, x + width, y + radius);

  this.lineTo(x + width, y + height - radius_low);
  this.quadraticCurveTo(x + width, y + height, x + width - radius_low, y + height);
  this.lineTo(x + radius_low, y + height);
  this.quadraticCurveTo(x, y + height, x, y + height - radius_low);
  this.lineTo(x, y + radius);
  this.quadraticCurveTo(x, y, x + radius, y);
}

function compareObjects(a,b)
{
	for(var i in a)
		if(a[i] != b[i])
			return false;
	return true;
}
LiteGraph.compareObjects = compareObjects;

function distance(a,b)
{
	return Math.sqrt( (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) );
}
LiteGraph.distance = distance;

function colorToString(c)
{
	return "rgba(" + Math.round(c[0] * 255).toFixed() + "," + Math.round(c[1] * 255).toFixed() + "," + Math.round(c[2] * 255).toFixed() + "," + (c.length == 4 ? c[3].toFixed(2) : "1.0") + ")";
}
LiteGraph.colorToString = colorToString;

function isInsideRectangle( x,y, left, top, width, height)
{
	if (left < x && (left + width) > x &&
		top < y && (top + height) > y)
		return true;
	return false;
}
LiteGraph.isInsideRectangle = isInsideRectangle;

//[minx,miny,maxx,maxy]
function growBounding( bounding, x,y)
{
	if(x < bounding[0])
		bounding[0] = x;
	else if(x > bounding[2])
		bounding[2] = x;

	if(y < bounding[1])
		bounding[1] = y;
	else if(y > bounding[3])
		bounding[3] = y;
}
LiteGraph.growBounding = growBounding;

//point inside boundin box
function isInsideBounding(p,bb)
{
	if (p[0] < bb[0][0] ||
		p[1] < bb[0][1] ||
		p[0] > bb[1][0] ||
		p[1] > bb[1][1])
		return false;
	return true;
}
LiteGraph.isInsideBounding = isInsideBounding;

//boundings overlap, format: [ startx, starty, width, height ]
function overlapBounding(a,b)
{
	var A_end_x = a[0] + a[2];
	var A_end_y = a[1] + a[3];
	var B_end_x = b[0] + b[2];
	var B_end_y = b[1] + b[3];

	if ( a[0] > B_end_x ||
		a[1] > B_end_y ||
		A_end_x < b[0] ||
		A_end_y < b[1])
		return false;
	return true;
}
LiteGraph.overlapBounding = overlapBounding;

//Convert a hex value to its decimal value - the inputted hex must be in the
//	format of a hex triplet - the kind we use for HTML colours. The function
//	will return an array with three values.
function hex2num(hex) {
	if(hex.charAt(0) == "#") hex = hex.slice(1); //Remove the '#' char - if there is one.
	hex = hex.toUpperCase();
	var hex_alphabets = "0123456789ABCDEF";
	var value = new Array(3);
	var k = 0;
	var int1,int2;
	for(var i=0;i<6;i+=2) {
		int1 = hex_alphabets.indexOf(hex.charAt(i));
		int2 = hex_alphabets.indexOf(hex.charAt(i+1));
		value[k] = (int1 * 16) + int2;
		k++;
	}
	return(value);
}

LiteGraph.hex2num = hex2num;

//Give a array with three values as the argument and the function will return
//	the corresponding hex triplet.
function num2hex(triplet) {
	var hex_alphabets = "0123456789ABCDEF";
	var hex = "#";
	var int1,int2;
	for(var i=0;i<3;i++) {
		int1 = triplet[i] / 16;
		int2 = triplet[i] % 16;

		hex += hex_alphabets.charAt(int1) + hex_alphabets.charAt(int2);
	}
	return(hex);
}

LiteGraph.num2hex = num2hex;

/* LiteGraph GUI elements used for canvas editing *************************************/

/**
* ContextMenu from LiteGUI
*
* @class ContextMenu
* @constructor
* @param {Array} values (allows object { title: "Nice text", callback: function ... })
* @param {Object} options [optional] Some options:\
* - title: title to show on top of the menu
* - callback: function to call when an option is clicked, it receives the item information
* - ignore_item_callbacks: ignores the callback inside the item, it just calls the options.callback
* - event: you can pass a MouseEvent, this way the ContextMenu appears in that position
*/
function ContextMenu( values, options )
{
	options = options || {};
	this.options = options;
	var that = this;

	//to link a menu with its parent
	if(options.parentMenu)
	{
		if( options.parentMenu.constructor !== this.constructor )
		{
			console.error("parentMenu must be of class ContextMenu, ignoring it");
			options.parentMenu = null;
		}
		else
		{
			this.parentMenu = options.parentMenu;
			this.parentMenu.lock = true;
			this.parentMenu.current_submenu = this;
		}
	}

	if(options.event && options.event.constructor !== MouseEvent && options.event.constructor !== CustomEvent)
	{
		console.error("Event passed to ContextMenu is not of type MouseEvent or CustomEvent. Ignoring it.");
		options.event = null;
	}

	var root = document.createElement("div");
	root.className = "litegraph litecontextmenu litemenubar-panel";
	if( options.className) 
		root.className += " " + options.className;
	root.style.minWidth = 100;
	root.style.minHeight = 100;
	root.style.pointerEvents = "none";
	setTimeout( function() { root.style.pointerEvents = "auto"; },100); //delay so the mouse up event is not caugh by this element

	//this prevents the default context browser menu to open in case this menu was created when pressing right button
	root.addEventListener("mouseup", function(e){
		e.preventDefault(); return true;
	}, true);
	root.addEventListener("contextmenu", function(e) {
		if(e.button != 2) //right button
			return false;
		e.preventDefault();
		return false;
	},true);

	root.addEventListener("mousedown", function(e){
		if(e.button == 2)
		{
			that.close();
			e.preventDefault(); return true;
		}
	}, true);

	function on_mouse_wheel(e)
	{
		var pos = parseInt( root.style.top );
		root.style.top = (pos + e.deltaY * options.scroll_speed).toFixed() + "px";
		e.preventDefault();
		return true;
	}

	if(!options.scroll_speed)
		options.scroll_speed = 0.1;

	root.addEventListener("wheel", on_mouse_wheel, true);
	root.addEventListener("mousewheel", on_mouse_wheel, true);


	this.root = root;

	//title
	if(options.title)
	{
		var element = document.createElement("div");
		element.className = "litemenu-title";
		element.innerHTML = options.title;
		root.appendChild(element);
	}

	//entries
	var num = 0;
	for(var i in values)
	{
		var name = values.constructor == Array ? values[i] : i;
		if( name != null && name.constructor !== String )
			name = name.content === undefined ? String(name) : name.content;
		var value = values[i];
		this.addItem( name, value, options );
		num++;
	}

	//close on leave
	root.addEventListener("mouseleave", function(e) {
		if(that.lock)
			return;
		if(root.closing_timer)
			clearTimeout( root.closing_timer );
		root.closing_timer = setTimeout( that.close.bind(that, e), 500 );
		//that.close(e);
	});

	root.addEventListener("mouseenter", function(e) {
		if(root.closing_timer)
			clearTimeout( root.closing_timer );
	});

	//insert before checking position
	var root_document = document;
	if(options.event)
		root_document = options.event.target.ownerDocument;

	if(!root_document)
		root_document = document;
	root_document.body.appendChild(root);

	//compute best position
	var left = options.left || 0;
	var top = options.top || 0;
	if(options.event)
	{
		left = (options.event.pageX - 10);
		top = (options.event.pageY - 10);
		if(options.title)
			top -= 20;

		if(options.parentMenu)
		{
			var rect = options.parentMenu.root.getBoundingClientRect();
			left = rect.left + rect.width;
		}

		var body_rect = document.body.getBoundingClientRect();
		var root_rect = root.getBoundingClientRect();

		if(left > (body_rect.width - root_rect.width - 10))
			left = (body_rect.width - root_rect.width - 10);
		if(top > (body_rect.height - root_rect.height - 10))
			top = (body_rect.height - root_rect.height - 10);
	}

	root.style.left = left + "px";
	root.style.top = top  + "px";
}

ContextMenu.prototype.addItem = function( name, value, options )
{
	var that = this;
	options = options || {};

	var element = document.createElement("div");
	element.className = "litemenu-entry submenu";

	var disabled = false;

	if(value === null)
	{
		element.classList.add("separator");
		//element.innerHTML = "<hr/>"
		//continue;
	}
	else
	{
		element.innerHTML = value && value.title ? value.title : name;
		element.value = value;

		if(value)
		{
			if(value.disabled)
			{
				disabled = true;
				element.classList.add("disabled");
			}
			if(value.submenu || value.has_submenu)
				element.classList.add("has_submenu");
		}

		if(typeof(value) == "function")
		{
			element.dataset["value"] = name;
			element.onclick_callback = value;
		}
		else
			element.dataset["value"] = value;

		if(value.className)
			element.className += " " + value.className;
	}

	this.root.appendChild(element);
	if(!disabled)
		element.addEventListener("click", inner_onclick);
	if(options.autoopen)
		element.addEventListener("mouseenter", inner_over);

	function inner_over(e)
	{
		var value = this.value;
		if(!value || !value.has_submenu)
			return;
		//if it is a submenu, autoopen like the item was clicked
		inner_onclick.call(this,e);
	}

	//menu option clicked
	function inner_onclick(e) {
		var value = this.value;
		var close_parent = true;

		if(that.current_submenu)
			that.current_submenu.close(e);

		//global callback
		if(options.callback)
		{
			var r = options.callback.call( this, value, options, e, that, options.node );
			if(r === true)
				close_parent = false;
		}

		//special cases
		if(value)
		{
			if (value.callback && !options.ignore_item_callbacks && value.disabled !== true )  //item callback
			{
				var r = value.callback.call( this, value, options, e, that, options.extra );
				if(r === true)
					close_parent = false;
			}
			if(value.submenu)
			{
				if(!value.submenu.options)
					throw("ContextMenu submenu needs options");
				var submenu = new that.constructor( value.submenu.options, {
					callback: value.submenu.callback,
					event: e,
					parentMenu: that,
					ignore_item_callbacks: value.submenu.ignore_item_callbacks,
					title: value.submenu.title,
					extra: value.submenu.extra,
					autoopen: options.autoopen
				});
				close_parent = false;
			}
		}

		if(close_parent && !that.lock)
			that.close();
	}

	return element;
}

ContextMenu.prototype.close = function(e, ignore_parent_menu)
{
	if(this.root.parentNode)
		this.root.parentNode.removeChild( this.root );
	if(this.parentMenu && !ignore_parent_menu)
	{
		this.parentMenu.lock = false;
		this.parentMenu.current_submenu = null;
		if( e === undefined )
			this.parentMenu.close();
		else if( e && !ContextMenu.isCursorOverElement( e, this.parentMenu.root) )
		{
			ContextMenu.trigger( this.parentMenu.root, "mouseleave", e );
		}
	}
	if(this.current_submenu)
		this.current_submenu.close(e, true);

	if(this.root.closing_timer)
		clearTimeout( this.root.closing_timer );
}

//this code is used to trigger events easily (used in the context menu mouseleave
ContextMenu.trigger = function( element, event_name, params, origin )
{
	var evt = document.createEvent( 'CustomEvent' );
	evt.initCustomEvent( event_name, true,true, params ); //canBubble, cancelable, detail
	evt.srcElement = origin;
	if( element.dispatchEvent )
		element.dispatchEvent( evt );
	else if( element.__events )
		element.__events.dispatchEvent( evt );
	//else nothing seems binded here so nothing to do
	return evt;
}

//returns the top most menu
ContextMenu.prototype.getTopMenu = function()
{
	if( this.options.parentMenu )
		return this.options.parentMenu.getTopMenu();
	return this;
}

ContextMenu.prototype.getFirstEvent = function()
{
	if( this.options.parentMenu )
		return this.options.parentMenu.getFirstEvent();
	return this.options.event;
}



ContextMenu.isCursorOverElement = function( event, element )
{
	var left = event.pageX;
	var top = event.pageY;
	var rect = element.getBoundingClientRect();
	if(!rect)
		return false;
	if(top > rect.top && top < (rect.top + rect.height) &&
		left > rect.left && left < (rect.left + rect.width) )
		return true;
	return false;
}



LiteGraph.ContextMenu = ContextMenu;

LiteGraph.closeAllContextMenus = function( ref_window )
{
	ref_window = ref_window || window;

	var elements = ref_window.document.querySelectorAll(".litecontextmenu");
	if(!elements.length)
		return;

	var result = [];
	for(var i = 0; i < elements.length; i++)
		result.push(elements[i]);

	for(var i in result)
	{
		if(result[i].close)
			result[i].close();
		else if(result[i].parentNode)
			result[i].parentNode.removeChild( result[i] );
	}
}

LiteGraph.extendClass = function ( target, origin )
{
	for(var i in origin) //copy class properties
	{
		if(target.hasOwnProperty(i))
			continue;
		target[i] = origin[i];
	}

	if(origin.prototype) //copy prototype properties
		for(var i in origin.prototype) //only enumerables
		{
			if(!origin.prototype.hasOwnProperty(i))
				continue;

			if(target.prototype.hasOwnProperty(i)) //avoid overwritting existing ones
				continue;

			//copy getters
			if(origin.prototype.__lookupGetter__(i))
				target.prototype.__defineGetter__(i, origin.prototype.__lookupGetter__(i));
			else
				target.prototype[i] = origin.prototype[i];

			//and setters
			if(origin.prototype.__lookupSetter__(i))
				target.prototype.__defineSetter__(i, origin.prototype.__lookupSetter__(i));
		}
}

//used to create nodes from wrapping functions
LiteGraph.getParameterNames = function(func) {
    return (func + '')
      .replace(/[/][/].*$/mg,'') // strip single-line comments
      .replace(/\s+/g, '') // strip white space
      .replace(/[/][*][^/*]*[*][/]/g, '') // strip multi-line comments  /**/
      .split('){', 1)[0].replace(/^[^(]*[(]/, '') // extract the parameters
      .replace(/=[^,]+/g, '') // strip any ES6 defaults
      .split(',').filter(Boolean); // split & filter [""]
}

Math.clamp = function(v,a,b) { return (a > v ? a : (b < v ? b : v)); }

if( typeof(window) != "undefined" && !window["requestAnimationFrame"] )
{
	window.requestAnimationFrame = window.webkitRequestAnimationFrame ||
		  window.mozRequestAnimationFrame    ||
		  (function( callback ){
			window.setTimeout(callback, 1000 / 60);
		  });
}

})(this);

if(typeof(exports) != "undefined")
	exports.LiteGraph = this.LiteGraph;
