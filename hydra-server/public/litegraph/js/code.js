
LiteGraph.node_images_path = "./litegraph/";
var editor = new LiteGraph.Editor("main");
window.graphcanvas = editor.graphcanvas;
window.graph = editor.graph;
window.addEventListener("resize", function() { editor.graphcanvas.resize(); } );
window.addEventListener("keydown", editor.graphcanvas.processKey.bind(editor.graphcanvas) );
window.onbeforeunload = function(){
	var data = JSON.stringify( graph.serialize() );
	localStorage.setItem("litegraphg demo backup", data );
}

//create scene selector
var elem = document.createElement("span");
elem.className = "selector";
elem.innerHTML = "<select><option>Empty</option></select> <button id='save'>Save</button><button id='load'>Load</button>";
editor.tools.appendChild(elem);
graph.load( "litegraph/json/spidermoon.json" );
var select = elem.querySelector("select");
select.addEventListener("change", function(e){
	var option = this.options[this.selectedIndex];
	var url = option.dataset["url"];
	
	if(url)
		graph.load( url );
	else if(option.callback)
		option.callback();
	else
		graph.clear();
});

elem.querySelector("#save").addEventListener("click",function(){
	console.log("saved");
	localStorage.setItem( "graph_save", JSON.stringify( graph.serialize() ) );
});

elem.querySelector("#load").addEventListener("click",function(){
	var data = localStorage.getItem( "graph_save" );
	if(data)
		graph.configure( JSON.parse( data ) );
	console.log("loaded");
});

function addDemo( name, url )
{
	var option = document.createElement("option");
	if(url.constructor === String)
		option.dataset["url"] = url;
	else
		option.callback = url;
	option.innerHTML = name;
	select.appendChild( option );
}

//some examples
addDemo("Spidermoon", "litegraph/json/spidermoon.json");
addDemo("MSML", "litegraph/json/msml.json");
addDemo("Julien", "litegraph/json/julien.json");
/*addDemo("Features", "litegraph/json/features.json");
addDemo("Benchmark", "litegraph/json/benchmark.json");
addDemo("Audio", "litegraph/json/audio.json");
addDemo("Audio Delay", "litegraph/json/audio_delay.json");
addDemo("Audio Reverb", "litegraph/json/audio_reverb.json");
addDemo("MIDI Generation", "litegraph/json/midi_generation.json");
addDemo("autobackup", function(){
	var data = localStorage.getItem("litegraphg demo backup");
	if(!data)
		return;
	var graph_data = JSON.parse(data);
	graph.configure( graph_data );
});
 */


