---
layout: post
title: Music Visualizer in C++ Using OpenGL Part 4
modified:
categories: blog
excerpt:
tags: []
image:
  feature:
date: 2016-05-26T14:12:04+05:30
---

We use `display()` function to plot the spectrum in OpenGL. This function is called each time we fetch N/2 points 
into the `graph[]`.


{% highlight c++ %}


void display() {
	glUseProgram(program);
	glUniform1i(uniform_mytexture, 0);

	glUniform1f(uniform_offset_x, offset_x);
	glUniform1f(uniform_scale_x, scale_x);

	glClearColor(0.0, 0.0, 0.0, 0.0);
	glClear(GL_COLOR_BUFFER_BIT);

	/* Set texture wrapping mode */
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, clamp ? GL_CLAMP_TO_EDGE : GL_REPEAT);

	/* Set texture interpolation mode */
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, interpolate ? GL_LINEAR : GL_NEAREST);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, interpolate ? GL_LINEAR : GL_NEAREST);

	/* Draw using the vertices in our vertex buffer object */
	glBindBuffer(GL_ARRAY_BUFFER, vbo);

	glEnableVertexAttribArray(attribute_coord1d);
	glVertexAttribPointer(attribute_coord1d, 1, GL_FLOAT, GL_FALSE, 0, 0);

	/* Draw the line */
	glDrawArrays(GL_LINE_STRIP, 0, 101);

	/* Draw points as well, if requested */
	if (showpoints)
		glDrawArrays(GL_POINTS, 0, 101);

	if(checkEnd() > 0){
		
		exit(0);
	}

	if(dataEnd != true){
		getData();
		glFlush();
	glutSwapBuffers();
	}
	else return;

	
}

{% endhighlight %}

`glutSpecialFunc(special)` calles the `void special(int key, int x, int y)` function which is used to get the
input F7,F8,F9 to toggle interpolation, clamping, and show points.


{% highlight c++ %}
void special(int key, int x, int y) {
	float t;
	switch (key) {
	case GLUT_KEY_F7:
		interpolate = !interpolate;
		printf("Interpolation is now %s\n", interpolate ? "on" : "off");
		break;
	case GLUT_KEY_F8:
		clamp = !clamp;
		printf("Clamping is now %s\n", clamp ? "on" : "off");
		break;
	case GLUT_KEY_F9:
		showpoints = !showpoints;
		printf("Showing points is now %s\n", showpoints ? "on" : "off");
		break;
	case GLUT_KEY_LEFT:
		offset_x -= 0.1;
		timePlay = music.getPlayingOffset();
		t = timePlay.asSeconds(); 
		music.setPlayingOffset(sf::seconds(t - 5));
		break;
	case GLUT_KEY_RIGHT:
		offset_x += 0.1;
		timePlay = music.getPlayingOffset();
		t = timePlay.asSeconds(); 
		music.setPlayingOffset(sf::seconds(t + 5));
		break;
	case GLUT_KEY_UP:
		scale_x *= 1.5;
		break;
	case GLUT_KEY_DOWN:
		scale_x /= 1.5;
		break;
	case GLUT_KEY_HOME:
		offset_x = 0.0;
		scale_x = 1.0;
		break;
	case GLUT_KEY_F10:
		exit(0);


	}

	glutPostRedisplay();
}

{% endhighlight %}

We also use `glutKeyboardFunc(key)` to get keyboard input. You can combine the above function with this if you want. 
For the sake of simplicity I have used another function `key()` to get keyboard input.

{% highlight c++ %}
void key(unsigned char k,int,int)
{
	if(k == 'p'){
		
		if(playFlag){
			music.pause();
			playFlag = !playFlag;
		}
		else
		{
			music.play();
			playFlag = !playFlag;
		}
	}
	
	if(k == 'm'){
		if(!muteFlag){
			music.setVolume(0);
			muteFlag=!muteFlag;
		}
		else{
			music.setVolume(100);
			muteFlag=!muteFlag;
		}
	}
	if(k == 'r')//reload audio	
		music.setPlayingOffset(sf::seconds(0));

	if(k == 'q')
		exit(0);

}
{% endhighlight %}

OpenGL have a function called `glutIdleFunc()` which loops and doesnot effect the display() function.
We are creating a new function called `moveWav()` to loop untill all the samples are fetched. This basically 
calls `getData()` and `display()`.    


{% highlight c++ %}

void moveWav()
{
	getData();
	display();
	glFlush();
	glutSwapBuffers();
}
{% endhighlight%}

## Compiling and running

Create a file called `compile` and add the following content.`mylib/lib` is where aquila library is build. 

{% highlight bash %}
#!/bin/bash
g++ -std=c++11 -c draw.cpp 
g++ -std=gnu++11 draw.o  \
kiss_fft130/kiss_fft.c  \
-L /home/<username>/mylib/lib/ \
-lAquila -lOoura_fft -lm \
-lglut -lGLEW -lGL -lGLU  \
-lfreetype -lsfml-system \
-lsfml-audio  ./common/shader_utils.o \
-o draw
{% endhighlight %}

After compiling type `./draw <audio>` to run the visualizer.

**[Full Source Code.](https://github.com/indrajithi/Audio-Visualizer)**