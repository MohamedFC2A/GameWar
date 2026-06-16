extends Control


var output_vector := Vector2.ZERO
var is_pressed := false

var outer_radius := 65.0
var inner_radius := 25.0
var knob_position := Vector2.ZERO
var touch_index := -1

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	custom_minimum_size = Vector2(outer_radius * 2, outer_radius * 2)
	pivot_offset = Vector2(outer_radius, outer_radius)
	visible = false

func reset() -> void:
	is_pressed = false
	touch_index = -1
	knob_position = Vector2.ZERO
	output_vector = Vector2.ZERO
	visible = false
	queue_redraw()

func handle_touch_press(local_pos: Vector2, index: int) -> void:
	touch_index = index
	is_pressed = true
	visible = true
	_update_knob_position(local_pos)

func handle_touch_drag(local_pos: Vector2, index: int) -> void:
	if index == touch_index:
		_update_knob_position(local_pos)

func handle_touch_release(index: int) -> void:
	if index == touch_index:
		reset()

func _update_knob_position(local_pos: Vector2) -> void:
	var center := Vector2(outer_radius, outer_radius)
	var offset := local_pos - center
	if offset.length() > outer_radius:
		offset = offset.normalized() * outer_radius
	knob_position = offset
	output_vector = offset / outer_radius
	queue_redraw()

func _draw() -> void:
	if not is_pressed:
		return
	
	var center := Vector2(outer_radius, outer_radius)
	
	# Draw outer ring with glassmorphism style
	draw_circle(center, outer_radius, Color(0.1, 0.15, 0.22, 0.35))
	draw_arc(center, outer_radius, 0.0, TAU, 36, Color(0.2, 0.62, 0.95, 0.6), 2.0)
	
	# Draw inner knob with nice solid neon blue color
	draw_circle(center + knob_position, inner_radius, Color(0.2, 0.62, 0.95, 0.85))
	draw_circle(center + knob_position, inner_radius - 4.0, Color(0.4, 0.8, 1.0, 0.6))
